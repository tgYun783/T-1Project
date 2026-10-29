import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiUnavailableError } from '../ai/ai-unavailable.error';
import { AiService } from '../ai/ai.service';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { CoverLetter } from '../cover-letters/cover-letter.schema';
import { FactDto } from '../experiences/experience.dto';
import { ExperiencesService } from '../experiences/experiences.service';
import {
  AnswerResultDto,
  CheckDto,
  CheckSentenceDto,
  ConfirmCandidateInput,
  toCandidateDto,
  toCheckDto,
  toSentenceDto,
} from './check.dto';
import { Check, INITIAL_FOLLOW_UPS, SentenceStatus } from './check.schema';
import {
  buildJudgeInput,
  buildQuestionInput,
  buildSentencesInput,
  JUDGE_SYSTEM,
  judgeSchema,
  QUESTION_SYSTEM,
  questionSchema,
  SENTENCES_SYSTEM,
  sentencesSchema,
} from './prompts';

type CoverLetterRecord = CoverLetter & { _id: Types.ObjectId };
type CheckRecord = Check & { _id: Types.ObjectId };

// 이미 확정했거나 버린 후보(api.md 9절). 같은 후보가 두 번 카드에 들어가거나 버린 것이 되살아나지 않게 한다.
function candidateResolved(): ConflictException {
  return new ConflictException({ code: 'CANDIDATE_RESOLVED', message: '이미 확정했거나 버린 후보예요.' });
}

@Injectable()
export class ChecksService {
  constructor(
    @InjectModel(Check.name) private readonly checks: Model<Check>,
    @InjectModel(CoverLetter.name) private readonly coverLetters: Model<CoverLetter>,
    private readonly ai: AiService,
    private readonly experiences: ExperiencesService,
  ) {}

  // 점검 만들기(R9). AI가 고른 문장은 믿지 않는다: 원문에 그대로 든 문장만 남기고, 문항 id는 서버가 다시 맞춘다.
  // AI 성공 뒤에만 저장해 실패하면 점검이 하나도 생기지 않는다(C2). 자소서는 읽기만 한다(C4).
  async create(userId: string, coverLetterId: string): Promise<CheckDto> {
    const owned = await this.findCoverLetter(userId, coverLetterId);
    const items = (owned.items ?? [])
      .filter((item) => item.answer !== null && item.answer !== undefined)
      .map((item) => ({ id: String(item._id), oid: item._id, answer: item.answer as string }));

    const result = await this.ai.json({
      task: 'check-sentences',
      system: SENTENCES_SYSTEM,
      user: buildSentencesInput(
        owned.kind === 'pasted'
          ? { kind: 'pasted', body: owned.body ?? '' }
          : { kind: 'generated', items: items.map(({ id, answer }) => ({ id, answer })) },
      ),
      schema: sentencesSchema,
    });

    const seen = new Set<string>();
    const sentences: { text: string; coverLetterItemId: Types.ObjectId | null }[] = [];
    for (const picked of result.sentences) {
      const text = picked.text.trim();
      if (!text) continue;
      let itemOid: Types.ObjectId | null = null;
      if (owned.kind === 'pasted') {
        if (!(owned.body ?? '').includes(text)) continue;
      } else {
        // AI가 고른 문항이 실제로 문장을 담고 있으면 그대로, 아니면 문장이 든 첫 문항으로 바로잡는다. 어디에도 없으면 버린다.
        const containing = items.filter((item) => item.answer.includes(text));
        const match = containing.find((item) => item.id === picked.coverLetterItemId) ?? containing[0];
        if (!match) continue;
        itemOid = match.oid;
      }
      const key = `${String(itemOid)}\u0000${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sentences.push({ text, coverLetterItemId: itemOid });
    }

    const created = await this.checks.create({
      userId: owned.userId,
      coverLetterId: owned._id,
      stale: false,
      sentences: sentences.map((s) => ({ ...s, status: 'pending', turns: [], followUpsLeft: INITIAL_FOLLOW_UPS })),
      candidates: [],
    });
    return toCheckDto(created.toObject());
  }

  // 남의 점검·없는 점검·잘못된 id 모두 같은 404(R1).
  async get(userId: string, checkId: string): Promise<CheckDto> {
    const doc = await this.checks.findById(parseObjectIdOr404(checkId)).lean<CheckRecord>();
    return toCheckDto(assertOwner(doc, userId));
  }

  // 자소서 소유 확인 뒤 그 자소서의 점검만 최신순(R11). 같은 시각이면 _id로 순서를 고정한다.
  async listByCoverLetter(userId: string, coverLetterId: string): Promise<CheckDto[]> {
    const owned = await this.findCoverLetter(userId, coverLetterId);
    const docs = await this.checks
      .find({ coverLetterId: owned._id, userId: owned.userId })
      .sort({ createdAt: -1, _id: -1 })
      .lean<CheckRecord[]>();
    return docs.map(toCheckDto);
  }

  // 문장 첫 질문(R10). 이미 시작한 문장은 AI 비용 없이 지금 상태를 그대로 돌려준다(api.md 9절).
  // AI 성공 뒤에만 turn·상태를 저장해 실패하면 문장이 pending 그대로 남는다(C2).
  async start(userId: string, checkId: string, sentenceId: string): Promise<CheckSentenceDto> {
    const check = await this.findActive(userId, checkId);
    const sentence = this.findSentence(check, sentenceId);
    if (sentence.status !== 'pending') return toSentenceDto(sentence);

    const owned = await this.findCoverLetter(userId, String(check.coverLetterId));
    const itemOid = sentence.coverLetterItemId;
    const item = itemOid ? (owned.items ?? []).find((i) => i._id.equals(itemOid)) : undefined;
    const result = await this.ai.json({
      task: 'check-question',
      system: QUESTION_SYSTEM,
      user: buildQuestionInput({
        sentence: sentence.text,
        context: item ? { question: item.question, text: item.answer ?? '' } : { text: owned.body ?? '' },
      }),
      schema: questionSchema,
    });

    // pending 조건을 걸어 동시에 두 번 시작해도 첫 질문이 두 개 붙지 않게 한다. AI 사이에 오래됨이 되면 저장하지 않는다.
    const updated = await this.checks
      .findOneAndUpdate(
        { _id: check._id, stale: false, sentences: { $elemMatch: { _id: sentence._id, status: 'pending' } } },
        {
          $set: { 'sentences.$.status': 'in_progress' },
          $push: { 'sentences.$.turns': { question: result.question, answer: null, judge: [] } },
        },
        { returnDocument: 'after' },
      )
      .lean<CheckRecord>();
    if (updated) return toSentenceDto(this.findSentence(updated, sentenceId));
    // 다른 요청이 먼저 시작했거나 그사이 오래됨이 됐다: 다시 읽어 같은 규칙(409·지금 상태)으로 답한다.
    const current = await this.findActive(userId, checkId);
    return toSentenceDto(this.findSentence(current, sentenceId));
  }

  // 답하기(R10·R11). 오래된 점검·시작 전·끝난 문장은 AI보다 먼저 409로 막는다(오래된 점검은 볼 수만 있다, 학생 답 2026-10-30).
  // AI는 기준별 met/missing만 고르고 상태는 서버가 ①~④ 순서로 정한다(명세 08). AI 성공 뒤에만 저장한다(C2).
  async answer(userId: string, checkId: string, sentenceId: string, text: string): Promise<AnswerResultDto> {
    const check = await this.findActive(userId, checkId);
    const sentence = this.findSentence(check, sentenceId);
    this.assertInProgress(sentence);

    const owned = await this.findCoverLetter(userId, String(check.coverLetterId));
    const itemOid = sentence.coverLetterItemId;
    const item = itemOid ? (owned.items ?? []).find((i) => i._id.equals(itemOid)) : undefined;
    const turns = sentence.turns ?? [];
    const cardIds = (item?.usedExperienceIds ?? []).map(String);
    const result = await this.ai.json({
      task: 'check-answer',
      system: JUDGE_SYSTEM,
      user: buildJudgeInput({
        sentence: sentence.text,
        context: item ? { question: item.question, text: item.answer ?? '' } : { text: owned.body ?? '' },
        turns,
        answer: text,
        experienceIds: cardIds,
      }),
      schema: judgeSchema,
    });

    // 후보(R12)는 확인 전이므로 candidate·ai_unverified로만 쌓는다(C1). experienceId는 AI 값을 믿지 않고
    // 문항 근거 카드 안이면 그 값, 아니면 첫 카드, 붙여넣은 자소서(카드 없음)면 null로 서버가 정한다(명세 08).
    const now = new Date();
    const candidates = result.candidates
      .map((c) => ({ item: c.item, text: c.text.trim(), experienceId: c.experienceId ?? null }))
      .filter((c) => c.text !== '')
      .map((c) => {
        const picked = c.experienceId && cardIds.includes(c.experienceId) ? c.experienceId : cardIds[0];
        return {
          _id: new Types.ObjectId(),
          experienceId: picked ? new Types.ObjectId(picked) : null,
          item: c.item,
          text: c.text,
          status: 'candidate' as const,
          source: 'ai_unverified' as const,
          clueId: null,
          origin: 'check' as const,
          createdAt: now,
        };
      });

    // 같은 기준이 두 번 오면 첫 판정만 남긴다(기준별로 한 줄이어야 프런트가 빠진 요소를 하나씩 보여 준다).
    const judge = result.judge.filter((j, i, all) => all.findIndex((o) => o.id === j.id) === i);
    const answeredTurns = turns.map((t, i) =>
      i === turns.length - 1 ? { question: t.question, answer: text, judge } : { question: t.question, answer: t.answer, judge: t.judge },
    );

    let status: SentenceStatus;
    let followUpsLeft = sentence.followUpsLeft;
    const nextTurns = [...answeredTurns];
    if (result.unknown) {
      // ① 모름·경험 없음은 J 판정보다 먼저 끝낸다(R11).
      status = 'unknown';
    } else if (judge.every((j) => j.result === 'met')) {
      // ② 해당 기준이 모두 충족.
      status = 'explained';
    } else if (followUpsLeft > 0) {
      // ③ 빠진 기준이 있고 추가 질문이 남았다: 다음 질문이 없으면 이어 갈 수 없으므로 AI 형식 오류(502)로 본다.
      const nextQuestion = result.nextQuestion?.trim();
      if (!nextQuestion) throw new AiUnavailableError();
      nextTurns.push({ question: nextQuestion, answer: null, judge: [] });
      followUpsLeft -= 1;
      status = 'in_progress';
    } else {
      // ④ 상한까지 물었는데 빠진 기준이 남았다.
      status = 'needs_more';
    }

    // in_progress·turn 수 조건을 걸어 동시에 두 번 답해도 한 번만 반영된다. AI 사이에 오래됨이 되면 저장하지 않는다.
    const updated = await this.checks
      .findOneAndUpdate(
        {
          _id: check._id,
          stale: false,
          sentences: { $elemMatch: { _id: sentence._id, status: 'in_progress', turns: { $size: turns.length } } },
        },
        {
          $set: {
            'sentences.$.status': status,
            'sentences.$.followUpsLeft': followUpsLeft,
            'sentences.$.turns': nextTurns,
          },
          // 문장 판정과 같은 원자적 갱신에 넣어야 답이 한 번만 반영될 때 후보도 한 번만 쌓인다.
          $push: { candidates: { $each: candidates } },
        },
        { returnDocument: 'after' },
      )
      .lean<CheckRecord>();
    if (updated) {
      return {
        sentence: toSentenceDto(this.findSentence(updated, sentenceId)),
        newCandidates: candidates.map(toCandidateDto),
      };
    }
    // 다른 요청이 먼저 답했거나 그사이 오래됨이 됐다: 다시 읽어 같은 규칙(409)으로 답하고, 아직 진행 중이면 지금 상태를 돌려준다.
    const current = this.findSentence(await this.findActive(userId, checkId), sentenceId);
    this.assertInProgress(current);
    return { sentence: toSentenceDto(current), newCandidates: [] };
  }

  // 점검 후보 확정(api.md 9절, R12·C1). 고른 경험이 내 것인지·단서 규칙은 ExperiencesService가 본 뒤,
  // 후보를 원자적으로 꺼내는 데 성공해야 사실을 만든다(동시에 두 번 확정해도 사실은 하나). 자소서는 건드리지 않는다(C4).
  // 오래된 점검도 허용한다: 후보는 사용자가 말한 사실이라 자소서가 바뀌어도 그대로 유효하다.
  async confirmCandidate(userId: string, checkId: string, factId: string, input: ConfirmCandidateInput): Promise<FactDto> {
    const check = await this.findOwnedCheck(userId, checkId);
    const candidate = this.findCandidate(check, factId);
    return this.experiences.addCheckFact(
      userId,
      input.experienceId,
      {
        item: input.item,
        text: input.text ?? candidate.text,
        source: input.source,
        clueId: input.clueId,
      },
      () => this.pullCandidate(check._id, candidate._id),
    );
  }

  // 후보 버리기(R12). 이미 확정했거나 버린 후보는 409로 알려 프런트가 목록을 다시 읽게 한다.
  async deleteCandidate(userId: string, checkId: string, factId: string): Promise<void> {
    const check = await this.findOwnedCheck(userId, checkId);
    const candidate = this.findCandidate(check, factId);
    await this.pullCandidate(check._id, candidate._id);
  }

  // 남의 점검·없는 점검·잘못된 id는 같은 404(R1). 후보 처리는 오래됨과 무관하게 소유만 본다.
  private async findOwnedCheck(userId: string, checkId: string): Promise<CheckRecord> {
    const doc = await this.checks.findById(parseObjectIdOr404(checkId)).lean<CheckRecord>();
    return assertOwner(doc, userId);
  }

  // 잘못된 id 형식은 404, 목록에 없는 후보는 이미 처리한 것으로 보고 409 CANDIDATE_RESOLVED(api.md 9절).
  private findCandidate(check: CheckRecord, factId: string): CheckRecord['candidates'][number] {
    const oid = parseObjectIdOr404(factId);
    const candidate = (check.candidates ?? []).find((c) => c._id.equals(oid));
    if (!candidate) throw candidateResolved();
    return candidate;
  }

  // 조건부 $pull로 꺼낸다: 다른 요청이 먼저 꺼냈으면 바뀐 것이 없으므로 409.
  private async pullCandidate(checkOid: Types.ObjectId, candidateOid: Types.ObjectId): Promise<void> {
    const res = await this.checks.updateOne(
      { _id: checkOid, 'candidates._id': candidateOid },
      { $pull: { candidates: { _id: candidateOid } } },
    );
    if (res.modifiedCount === 0) throw candidateResolved();
  }

  // 질문 없이 답을 받거나 끝난 판정을 덮어쓰지 않도록 진행 중인 문장만 답을 받는다(api.md 9절).
  private assertInProgress(sentence: CheckRecord['sentences'][number]): void {
    if (sentence.status === 'pending') {
      throw new ConflictException({ code: 'SENTENCE_NOT_STARTED', message: '먼저 이 문장의 질문을 시작해 주세요.' });
    }
    if (sentence.status !== 'in_progress') {
      throw new ConflictException({ code: 'SENTENCE_FINISHED', message: '이미 점검을 마친 문장이에요.' });
    }
  }

  // 소유 확인(404) 뒤 오래된 점검이면 409 CHECK_STALE. 자소서가 바뀐 뒤의 점검으로 이어 가면 지금 글과 다른 문장을 해명하게 된다.
  private async findActive(userId: string, checkId: string): Promise<CheckRecord> {
    const doc = await this.checks.findById(parseObjectIdOr404(checkId)).lean<CheckRecord>();
    const check = assertOwner(doc, userId);
    if (check.stale) {
      throw new ConflictException({
        code: 'CHECK_STALE',
        message: '점검을 만든 뒤 자기소개서가 바뀌었어요. 새 점검을 만들어 주세요.',
      });
    }
    return check;
  }

  // 없는 문장·잘못된 id는 남의 자원과 같은 404 본문(R1).
  private findSentence(check: CheckRecord, sentenceId: string): CheckRecord['sentences'][number] {
    const oid = parseObjectIdOr404(sentenceId);
    const sentence = (check.sentences ?? []).find((s) => s._id.equals(oid));
    if (!sentence) throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    return sentence;
  }

  // 남의 자소서·없는 자소서·잘못된 id 모두 같은 404(R1). AI를 부르기 전에 막아 남의 자소서로 비용이 들지 않게 한다.
  private async findCoverLetter(userId: string, id: string): Promise<CoverLetterRecord> {
    const doc = await this.coverLetters.findById(parseObjectIdOr404(id)).lean<CoverLetterRecord>();
    return assertOwner(doc, userId);
  }
}
