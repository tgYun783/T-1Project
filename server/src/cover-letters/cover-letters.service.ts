import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { Check } from '../checks/check.schema';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { ExperienceDto } from '../experiences/experience.dto';
import { Experience } from '../experiences/experience.schema';
import { ExperiencesService } from '../experiences/experiences.service';
import { Fact } from '../experiences/fact.schema';
import { CoverLetterDto, CoverLetterItemDto, toCoverLetterDto, toItemDto } from './cover-letter.dto';
import { CoverLetter, CoverLetterItem } from './cover-letter.schema';
import {
  COVER_LETTER_REASONS,
  coverLetterValidationError,
  CreateCoverLetterInput,
  GenerateCoverLetterInput,
  UpdateCoverLetterInput,
} from './cover-letter.validation';
import {
  ANSWER_SYSTEM,
  answerSchema,
  buildAnswerInput,
  buildRecommendInput,
  RECOMMEND_SYSTEM,
  RecommendCard,
  recommendSchema,
} from './prompts';

type CoverLetterRecord = CoverLetter & { _id: Types.ObjectId };
type ItemRecord = CoverLetterItem & { _id: Types.ObjectId };

@Injectable()
export class CoverLettersService {
  constructor(
    @InjectModel(CoverLetter.name) private readonly coverLetters: Model<CoverLetter>,
    @InjectModel(Experience.name) private readonly experiences: Model<Experience>,
    @InjectModel(Fact.name) private readonly facts: Model<Fact>,
    // 자소서가 바뀌면 기존 점검을 오래됨으로 표시하려고 점검 모델을 직접 쓴다(ChecksModule과 순환 import를 피한다).
    @InjectModel(Check.name) private readonly checks: Model<Check>,
    private readonly ai: AiService,
    // 근거 카드를 경험 상세와 같은 모양으로 만들려고 경험 모듈의 조립을 그대로 쓴다(모양이 두 곳에서 갈라지지 않게).
    private readonly experienceCards: ExperiencesService,
  ) {}

  // 문항별 카드 추천(R8). 후보 집합은 서버가 정하고 AI는 그 안에서만 고른다: AI가 돌려준 id는 집합과 대조해 버린다.
  // AI 성공 뒤에만 추천을 저장해 실패하면 문항이 그대로 남는다(C2). 응답(answer)은 건드리지 않는다(C4).
  async recommend(userId: string, id: string, itemId: string): Promise<CoverLetterItemDto> {
    const owned = await this.findOwned(userId, id);
    const item = this.findItem(owned, itemId);
    const cards = await this.confirmedCards(owned.userId);
    // 고를 카드가 없으면 AI 비용을 쓰지 않고 경험 정리로 안내한다(api.md 7절).
    if (!cards.length) {
      throw new BadRequestException({
        code: 'NO_CONFIRMED_FACTS',
        message: '확정한 사실이 있는 경험이 없어요. 경험 카드를 먼저 정리해 주세요.',
      });
    }

    const result = await this.ai.json({
      task: 'cover-letter-recommend',
      system: RECOMMEND_SYSTEM,
      user: buildRecommendInput({
        preferred: owned.target?.preferred ?? '',
        talent: owned.target?.talent ?? '',
        question: item.question,
        cards,
      }),
      schema: recommendSchema,
    });

    // 후보 집합 밖 id(지어낸 id·남의 id·후보만 있는 경험)는 버리고, 같은 카드가 두 번 오면 처음 것만 남긴다.
    const allowed = new Set(cards.map((card) => card.id));
    const seen = new Set<string>();
    const recommendations: { experienceId: Types.ObjectId; reason: string }[] = [];
    for (const rec of result.recommendations) {
      const expId = rec.experienceId.trim();
      if (!allowed.has(expId) || seen.has(expId)) continue;
      seen.add(expId);
      recommendations.push({ experienceId: new Types.ObjectId(expId), reason: rec.reason.trim() });
    }

    const updated = await this.coverLetters
      .findOneAndUpdate(
        { _id: owned._id, userId: owned.userId, 'items._id': item._id },
        { $set: { 'items.$.recommendations': recommendations } },
        { returnDocument: 'after' },
      )
      .lean<CoverLetterRecord>();
    return toItemDto(this.findItem(assertOwner(updated, userId), itemId));
  }

  // 문항에 쓸 카드 고르기(R8·R13). 추천에 없던 카드도 내 확정 카드면 받는다. AI를 부르지 않고 answer도 건드리지 않는다(C4).
  // 다른 문항에서 이미 고르거나 쓴 카드는 막지 않고 usedElsewhere로 알리기만 한다(api.md 7절 ②).
  async selectExperiences(
    userId: string,
    id: string,
    itemId: string,
    experienceIds: string[],
  ): Promise<{ item: CoverLetterItemDto; usedElsewhere: { experienceId: string; itemIds: string[] }[] }> {
    const owned = await this.findOwned(userId, id);
    const item = this.findItem(owned, itemId);
    const oids = experienceIds.map(parseObjectIdOr404);

    // 남의 경험·지운 경험·없는 id는 하나라도 섞이면 같은 404로 막는다(R1): 존재 여부가 새지 않게 한다.
    const mine = await this.experiences.countDocuments({ _id: { $in: oids }, userId: owned.userId });
    if (mine !== oids.length) throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });

    // 후보 사실만 있는 카드는 근거가 아직 없다(C1): 문제 카드를 고른 순서대로 알려 주고 아무것도 저장하지 않는다.
    const confirmed = new Set(
      (
        await this.facts.distinct('experienceId', {
          experienceId: { $in: oids },
          userId: owned.userId,
          status: 'confirmed',
        })
      ).map(String),
    );
    const missing = experienceIds.filter((expId) => !confirmed.has(expId));
    if (missing.length) {
      throw new BadRequestException({
        code: 'NO_CONFIRMED_FACTS',
        message: '확정한 사실이 없는 경험 카드는 고를 수 없어요. 카드를 먼저 정리해 주세요.',
        details: missing.map((experienceId) => ({ experienceId })),
      });
    }

    const usedElsewhere = experienceIds
      .map((experienceId) => ({
        experienceId,
        itemIds: (owned.items ?? [])
          .filter((other) => !item._id.equals(other._id))
          .filter((other) =>
            [...(other.selectedExperienceIds ?? []), ...(other.usedExperienceIds ?? [])].some(
              (e) => String(e) === experienceId,
            ),
          )
          .map((other) => String(other._id)),
      }))
      .filter((entry) => entry.itemIds.length > 0);

    const updated = await this.coverLetters
      .findOneAndUpdate(
        { _id: owned._id, userId: owned.userId, 'items._id': item._id },
        { $set: { 'items.$.selectedExperienceIds': oids } },
        { returnDocument: 'after' },
      )
      .lean<CoverLetterRecord>();
    return { item: toItemDto(this.findItem(assertOwner(updated, userId), itemId)), usedElsewhere };
  }

  // 문항 응답 생성(R8·R13). AI가 answer를 만드는 유일한 경로이며 사용자가 부를 때만 실행된다(C4).
  // 고른 카드의 확정 사실만 AI에 넘기고, AI 성공 뒤에만 answer·usedExperienceIds를 저장한다(C2).
  async generateAnswer(
    userId: string,
    id: string,
    itemId: string,
    input: { confirmOverwrite: boolean },
  ): Promise<CoverLetterItemDto> {
    const owned = await this.findOwned(userId, id);
    const item = this.findItem(owned, itemId);
    const selected = (item.selectedExperienceIds ?? []).map((e) => new Types.ObjectId(String(e)));
    if (!selected.length) {
      throw new BadRequestException({
        code: 'NO_SELECTED_EXPERIENCES',
        message: '이 문항에 쓸 경험 카드를 먼저 골라 주세요.',
      });
    }
    // 사용자가 고친 글은 확인 없이 덮어쓰지 않는다(R13). AI 비용도 확인 뒤에만 쓴다.
    if (item.answer !== null && item.answerEdited && !input.confirmOverwrite) {
      throw new ConflictException({
        code: 'OVERWRITE_CONFIRM_REQUIRED',
        message: '직접 고친 응답이 있어요. 덮어쓸지 확인해 주세요.',
      });
    }

    // 고른 뒤에 카드가 지워졌거나 확정 사실이 없어졌으면 근거 없는 응답이 되므로 PUT .../experiences와 같은 400으로 막는다.
    const cards = await this.confirmedCards(owned.userId, selected);
    const byId = new Map(cards.map((card) => [card.id, card]));
    const missing = selected.map(String).filter((expId) => !byId.has(expId));
    if (missing.length) {
      throw new BadRequestException({
        code: 'NO_CONFIRMED_FACTS',
        message: '확정한 사실이 없는 경험 카드가 있어요. 카드를 다시 골라 주세요.',
        details: missing.map((experienceId) => ({ experienceId })),
      });
    }

    const result = await this.ai.json({
      task: 'cover-letter-answer',
      system: ANSWER_SYSTEM,
      user: buildAnswerInput({
        preferred: owned.target?.preferred ?? '',
        talent: owned.target?.talent ?? '',
        question: item.question,
        cards: selected.map((oid) => byId.get(String(oid))!),
      }),
      schema: answerSchema,
    });

    const updated = await this.markChanged(
      owned,
      userId,
      {
        $set: {
          'items.$.answer': result.answer.trim(),
          'items.$.usedExperienceIds': selected,
          'items.$.answerEdited': false,
        },
      },
      item._id,
    );
    return toItemDto(this.findItem(updated, itemId));
  }

  // 사용자가 고친 응답 저장(R8). answerEdited를 켜 두어야 다음 응답 생성이 덮어쓰기 확인을 요구한다(R13).
  async updateItem(userId: string, id: string, itemId: string, input: { answer: string }): Promise<CoverLetterItemDto> {
    const owned = await this.findOwned(userId, id);
    const item = this.findItem(owned, itemId);
    const updated = await this.markChanged(
      owned,
      userId,
      { $set: { 'items.$.answer': input.answer, 'items.$.answerEdited': true } },
      item._id,
    );
    return toItemDto(this.findItem(updated, itemId));
  }

  // 확정 사실이 1개 이상인 내 경험만 카드로 본다(C1). 후보 사실은 읽지 않아 AI 입력에 들어갈 수 없다.
  // experienceIds를 주면 그 카드들로만 좁힌다(문항 응답은 고른 카드만 쓴다).
  private async confirmedCards(userId: Types.ObjectId, experienceIds?: Types.ObjectId[]): Promise<RecommendCard[]> {
    const facts = await this.facts
      .find({ userId, status: 'confirmed', ...(experienceIds ? { experienceId: { $in: experienceIds } } : {}) })
      .select('experienceId text')
      .sort({ createdAt: 1, _id: 1 })
      .lean<Pick<Fact, 'experienceId' | 'text'>[]>();
    if (!facts.length) return [];
    const byExperience = new Map<string, string[]>();
    for (const fact of facts) {
      const key = String(fact.experienceId);
      byExperience.set(key, [...(byExperience.get(key) ?? []), fact.text]);
    }
    // 사실이 남아 있어도 경험이 지워졌거나 내 것이 아니면 카드가 아니다: 경험을 userId로 다시 걸러 낸다.
    const experiences = await this.experiences
      .find({ _id: { $in: [...byExperience.keys()].map((k) => new Types.ObjectId(k)) }, userId })
      .select('title')
      .sort({ updatedAt: -1, _id: -1 })
      .lean<(Pick<Experience, 'title'> & { _id: Types.ObjectId })[]>();
    return experiences.map((exp) => ({
      id: String(exp._id),
      title: exp.title,
      facts: byExperience.get(String(exp._id)) ?? [],
    }));
  }

  // 없는 문항·잘못된 문항 id는 자소서와 같은 404로 돌린다(R1).
  private findItem(owned: CoverLetterRecord, itemId: string): ItemRecord {
    const oid = parseObjectIdOr404(itemId);
    const item = (owned.items ?? []).find((i) => oid.equals(i._id));
    if (!item) throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    return item;
  }

  // 붙여넣은 자소서는 문항·우대사항이 없다(api.md 7절): items []·target null로 고정한다.
  async createPasted(userId: string, input: CreateCoverLetterInput): Promise<CoverLetterDto> {
    const created = await this.coverLetters.create({
      userId: new Types.ObjectId(userId),
      kind: 'pasted',
      title: input.title,
      body: input.body,
      target: null,
      items: [],
    });
    return toCoverLetterDto(created.toObject());
  }

  // 작성할 자소서는 빈 문항으로만 만든다: 응답은 사용자가 문항별 .../answer를 부를 때만 AI가 만든다(C4).
  // 그래서 여기서는 AI를 부르지 않고, 문항의 answer·추천·선택은 스키마 기본값(null·[]·false)으로 둔다.
  async createGenerated(userId: string, input: GenerateCoverLetterInput): Promise<CoverLetterDto> {
    const created = await this.coverLetters.create({
      userId: new Types.ObjectId(userId),
      kind: 'generated',
      title: input.title,
      body: null,
      target: { preferred: input.preferred, talent: input.talent },
      items: input.questions.map((question) => ({ question })),
    });
    return toCoverLetterDto(created.toObject());
  }

  // 자소서 상세 + 응답에 실제로 쓴 카드(R13). 고르기만 한 카드(selected)가 아니라 usedExperienceIds만 모아야 근거 표시가 응답과 맞는다.
  // 문항 순서대로 처음 나온 순서로 중복을 지워 화면 순서를 고정하고, 지운 경험은 getMany가 빼 준다.
  async get(userId: string, id: string): Promise<{ coverLetter: CoverLetterDto; experiences: ExperienceDto[] }> {
    const owned = await this.findOwned(userId, id);
    const used = new Map<string, Types.ObjectId>();
    for (const item of owned.items ?? []) {
      for (const expId of item.usedExperienceIds ?? []) {
        const key = String(expId);
        if (!used.has(key)) used.set(key, new Types.ObjectId(key));
      }
    }
    return {
      coverLetter: toCoverLetterDto(owned),
      experiences: await this.experienceCards.getMany(userId, [...used.values()]),
    };
  }

  // 토큰 사용자의 것만, 최근 수정순(R1·R7). 같은 시각이면 _id로 순서를 고정해 목록이 흔들리지 않게 한다.
  async listByUser(userId: string): Promise<CoverLetterDto[]> {
    const docs = await this.coverLetters
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<CoverLetterRecord[]>();
    return docs.map(toCoverLetterDto);
  }

  // 소유자 확인 뒤에만 고친다. 생성한 자소서의 글은 문항 응답이 만드므로 body를 받지 않는다(api.md 7절).
  async update(userId: string, id: string, input: UpdateCoverLetterInput): Promise<CoverLetterDto> {
    const owned = await this.findOwned(userId, id);
    if (owned.kind === 'generated' && input.body !== undefined) {
      throw coverLetterValidationError([{ field: 'body', reason: COVER_LETTER_REASONS.generatedBody }]);
    }
    if (Object.keys(input).length === 0) return toCoverLetterDto(owned);
    return toCoverLetterDto(await this.markChanged(owned, userId, { $set: input }));
  }

  // 자소서를 바꾸는 모든 API(PATCH 자소서·문항 응답 수정·응답 생성)가 이 한 곳으로 저장한다.
  // 명세 08이 여기에 「기존 점검 오래됨」 표시를 붙이므로, 변경 지점이 흩어지면 오래됨 누락이 생긴다.
  private async markChanged(
    owned: CoverLetterRecord,
    userId: string,
    change: UpdateQuery<CoverLetter>,
    itemId?: Types.ObjectId,
  ): Promise<CoverLetterRecord> {
    // 문항을 바꿀 때는 그 문항을 조건에 넣어 위치 연산자(items.$)가 그 문항만 가리키게 한다.
    const filter = { _id: owned._id, userId: owned.userId, ...(itemId ? { 'items._id': itemId } : {}) };
    const updated = await this.coverLetters
      .findOneAndUpdate(filter, change, { returnDocument: 'after' })
      .lean<CoverLetterRecord>();
    const changed = assertOwner(updated, userId);
    // 글이 바뀌면 기존 점검의 문장이 지금 글과 어긋난다: 그 자소서의 점검을 모두 오래됨으로 표시한다(api.md 9절).
    await this.checks.updateMany({ coverLetterId: owned._id, userId: owned.userId }, { $set: { stale: true } });
    return changed;
  }

  // 남의 것·없는 것·잘못된 id 모두 같은 404(R1).
  private async findOwned(userId: string, id: string): Promise<CoverLetterRecord> {
    const doc = await this.coverLetters.findById(parseObjectIdOr404(id)).lean<CoverLetterRecord>();
    return assertOwner(doc, userId);
  }
}
