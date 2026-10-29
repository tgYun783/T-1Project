import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AiService } from '../ai/ai.service';
import { FakeAiService } from '../ai/fake-ai.service';
import { AuthModule } from '../auth/auth.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { UsersModule } from '../users/users.module';
import { ExperiencesModule } from './experiences.module';

interface MessageBody {
  role: string;
  text: string;
  createdAt: string;
}

interface ConversationBody {
  messages: MessageBody[];
  itemStatus: Record<string, string | null>;
  candidates: unknown[];
}

interface StartBody {
  question: MessageBody;
  itemStatus: Record<string, string | null>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ITEMS = ['situation', 'role', 'action', 'result', 'meaning'];
const ALL_NULL = Object.fromEntries(ITEMS.map((item) => [item, null]));
const FIRST_STATUS = {
  situation: 'needs_more',
  role: null,
  action: null,
  result: null,
  meaning: null,
};

// 경험 대화 시작·조회(api.md 5절, 명세 06 C6-1). AI는 항상 가짜: 팀 예산($10)을 테스트가 쓰지 않게 한다.
describe('Experience conversation start/get (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let connection: Connection;
  const fake = new FakeAiService();

  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<string> {
    const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
    return (res.body as { token: string }).token;
  }

  async function createExperience(token: string): Promise<string> {
    const res = await http()
      .post('/api/experiences')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '동아리 축제', period: '2025년 여름' })
      .expect(201);
    return (res.body as { experience: { id: string } }).experience.id;
  }

  function fileClue(token: string, expId: string, filename: string, description?: string) {
    let req = http()
      .post(`/api/experiences/${expId}/clues`)
      .set('Authorization', `Bearer ${token}`)
      .field('type', 'document');
    if (description !== undefined) req = req.field('description', description);
    return req.attach('file', Buffer.from('%PDF-1.4 bytes'), { filename, contentType: 'application/pdf' }).expect(201);
  }

  function getConversation(token: string, expId: string) {
    return http().get(`/api/experiences/${expId}/conversation`).set('Authorization', `Bearer ${token}`);
  }

  function start(token: string, expId: string) {
    return http().post(`/api/experiences/${expId}/conversation/start`).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        ExperiencesModule,
      ],
    })
      .overrideProvider(AiService)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  beforeEach(() => fake.reset());

  // 대화 화면은 처음 열 때 빈 대화·현재 상태를 그려야 한다(R3). 경험을 막 만든 상태에서 500·404가 나면 안 된다.
  it('GET before start → 200 empty messages, current itemStatus, no candidates', async () => {
    const token = await signup('conv-empty@example.com');
    const expId = await createExperience(token);
    const res = await getConversation(token, expId).expect(200);
    const body = res.body as ConversationBody;
    expect(Object.keys(body).sort()).toEqual(['candidates', 'itemStatus', 'messages']);
    expect(body).toEqual({ messages: [], itemStatus: ALL_NULL, candidates: [] });
    expect(fake.calls).toHaveLength(0);
  });

  // 첫 질문은 사용자가 쓴 단서 설명·텍스트만 보고 만든다. 파일 이름·설명 없는 파일이 새면 api.md 0절 약속(AI는 파일을 읽지 않음)을 어긴다.
  it('POST start → 200 {question, itemStatus}, saves AI message, AI input has descriptions/text but no file names', async () => {
    const token = await signup('conv-start@example.com');
    const expId = await createExperience(token);
    await http()
      .post(`/api/experiences/${expId}/clues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'text', text: '회의록: 부스 동선 재배치 논의' })
      .expect(201);
    await fileClue(token, expId, 'secret-name.pdf', '축제 부스 배치도 최종본');
    await fileClue(token, expId, 'nodesc-file.pdf');

    fake.queue('conversation-start', { question: '그때 어떤 상황이었나요?', itemStatus: FIRST_STATUS });
    const res = await start(token, expId).expect(200);
    const body = res.body as StartBody;
    expect(Object.keys(body).sort()).toEqual(['itemStatus', 'question']);
    expect(Object.keys(body.question).sort()).toEqual(['createdAt', 'role', 'text']);
    expect(body.question).toMatchObject({ role: 'ai', text: '그때 어떤 상황이었나요?' });
    expect(body.question.createdAt).toMatch(ISO);
    expect(body.itemStatus).toEqual(FIRST_STATUS);

    expect(fake.calls).toHaveLength(1);
    const input = fake.calls[0].user;
    expect(input).toContain('동아리 축제');
    expect(input).toContain('2025년 여름');
    expect(input).toContain('회의록: 부스 동선 재배치 논의');
    expect(input).toContain('축제 부스 배치도 최종본');
    expect(input).not.toContain('secret-name');
    expect(input).not.toContain('nodesc-file');
    expect(input).not.toContain('.pdf');
    // 설명 없는 파일 단서는 아예 빠져야 한다: 단서 줄이 텍스트 1개·설명 1개, 딱 둘이어야 한다.
    expect(input.match(/^- /gm)).toHaveLength(2);

    const conv = (await getConversation(token, expId).expect(200)).body as ConversationBody;
    expect(conv.messages).toEqual([body.question]);
    expect(conv.itemStatus).toEqual(FIRST_STATUS);
  });

  // 다시 들어와 이어 갈 때 AI를 또 부르면 비용이 들고 질문이 중복된다(api.md 5절: 마지막 AI 질문을 돌려줌).
  it('second POST start → same last AI question, no AI call', async () => {
    const token = await signup('conv-again@example.com');
    const expId = await createExperience(token);
    fake.queue('conversation-start', { question: '첫 질문입니다', itemStatus: FIRST_STATUS });
    const first = (await start(token, expId).expect(200)).body as StartBody;
    expect(fake.calls).toHaveLength(1);

    // 큐가 비어 있으므로 AI를 부르면 500이 나 테스트가 실패한다.
    const second = (await start(token, expId).expect(200)).body as StartBody;
    expect(fake.calls).toHaveLength(1);
    expect(second.question).toEqual(first.question);
    expect(second.itemStatus).toEqual(FIRST_STATUS);

    const conv = (await getConversation(token, expId).expect(200)).body as ConversationBody;
    expect(conv.messages).toHaveLength(1);
  });

  // AI가 실패하면 아무것도 저장하지 않아야 재시도가 깨끗하다(C2).
  it('AI failure → 502 AI_UNAVAILABLE, zero messages, itemStatus unchanged; retry then works', async () => {
    const token = await signup('conv-fail@example.com');
    const expId = await createExperience(token);
    fake.fail('conversation-start');
    const res = await start(token, expId).expect(502);
    expect((res.body as { error: { code: string } }).error.code).toBe('AI_UNAVAILABLE');

    const conv = (await getConversation(token, expId).expect(200)).body as ConversationBody;
    expect(conv.messages).toEqual([]);
    expect(conv.itemStatus).toEqual(ALL_NULL);

    // 스키마 밖 응답도 실패로 처리돼 저장되지 않는다(AI 응답은 믿지 않는다).
    fake.queue('conversation-start', { question: '', itemStatus: { situation: 'great' } });
    await start(token, expId).expect(502);
    expect(((await getConversation(token, expId)).body as ConversationBody).messages).toEqual([]);

    fake.queue('conversation-start', { question: '다시 묻습니다', itemStatus: FIRST_STATUS });
    await start(token, expId).expect(200);
    expect(((await getConversation(token, expId)).body as ConversationBody).messages).toHaveLength(1);
  });

  // 남의 경험 대화는 존재 여부도 알 수 없어야 하고(R1), AI도 불리면 안 된다.
  it("other user's experience / bad id / missing id → 404 for GET and start, no AI call", async () => {
    const owner = await signup('conv-owner@example.com');
    const other = await signup('conv-other@example.com');
    const expId = await createExperience(owner);
    await getConversation(other, expId).expect(404);
    await start(other, expId).expect(404);
    await getConversation(owner, 'not-an-id').expect(404);
    await start(owner, 'not-an-id').expect(404);
    await start(owner, '64b7f0000000000000000000').expect(404);
    expect(fake.calls).toHaveLength(0);
  });

  it('no token → 401', async () => {
    const owner = await signup('conv-anon@example.com');
    const expId = await createExperience(owner);
    await http().get(`/api/experiences/${expId}/conversation`).expect(401);
    await http().post(`/api/experiences/${expId}/conversation/start`).expect(401);
  });

  // 답하기(api.md 5절, 명세 06 C6-2). 답 하나에 AI 한 번으로 다음 질문·상태·후보를 함께 받는다(R3·R4).
  describe('conversation answers', () => {
    const AFTER_ANSWER = {
      situation: 'explained',
      role: 'needs_more',
      action: null,
      result: null,
      meaning: null,
    };

    interface FactBody {
      id: string;
      item: string;
      text: string;
      status: string;
      source: string;
      clueId: string | null;
      origin: string;
      createdAt: string;
    }

    interface AnswerBody {
      answer: MessageBody;
      question: MessageBody;
      itemStatus: Record<string, string | null>;
      newCandidates: FactBody[];
    }

    function answer(token: string, expId: string, body: unknown) {
      return http()
        .post(`/api/experiences/${expId}/conversation/answers`)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);
    }

    async function startedExperience(email: string): Promise<{ token: string; expId: string }> {
      const token = await signup(email);
      const expId = await createExperience(token);
      fake.queue('conversation-start', { question: '그때 어떤 상황이었나요?', itemStatus: FIRST_STATUS });
      await start(token, expId).expect(200);
      return { token, expId };
    }

    async function experienceBody(token: string, expId: string) {
      const res = await http().get(`/api/experiences/${expId}`).set('Authorization', `Bearer ${token}`).expect(200);
      return (res.body as { experience: { candidates: FactBody[]; card: Record<string, FactBody[]> } }).experience;
    }

    // 대화가 없는데 답을 받으면 무엇에 대한 답인지 알 수 없다: 409로 막고 AI도 부르지 않는다(api.md 5절).
    it('before start → 409 CONVERSATION_NOT_STARTED, no AI call, nothing saved', async () => {
      const token = await signup('ans-notstarted@example.com');
      const expId = await createExperience(token);
      const res = await answer(token, expId, { text: '축제 부스를 맡았어요' }).expect(409);
      expect((res.body as { error: { code: string } }).error.code).toBe('CONVERSATION_NOT_STARTED');
      expect(fake.calls).toHaveLength(0);
      expect(((await getConversation(token, expId)).body as ConversationBody).messages).toEqual([]);
    });

    // 빈 답은 AI 비용만 쓰고 기록할 내용이 없다: AI 호출 전에 400으로 막는다.
    it('empty / blank / missing / non-string text → 400 VALIDATION field text, no AI call', async () => {
      const { token, expId } = await startedExperience('ans-empty@example.com');
      fake.reset();
      for (const body of [{ text: '' }, { text: '   ' }, {}, { text: 3 }]) {
        const res = await answer(token, expId, body).expect(400);
        const err = (res.body as { error: { code: string; details: { field: string }[] } }).error;
        expect(err.code).toBe('VALIDATION');
        expect(err.details.map((d) => d.field)).toEqual(['text']);
      }
      expect(fake.calls).toHaveLength(0);
      expect(((await getConversation(token, expId)).body as ConversationBody).messages).toHaveLength(1);
    });

    // 후보는 AI가 뽑았을 뿐 확인되지 않은 것이라 candidate·ai_unverified로만 쌓이고 카드에는 들어가지 않는다(C1, R4).
    it('answer → 200 {answer, question, itemStatus, newCandidates}; messages and candidates accumulate, card stays empty', async () => {
      const { token, expId } = await startedExperience('ans-ok@example.com');
      fake.queue('conversation-answer', {
        question: '그때 맡은 역할은 무엇이었나요?',
        itemStatus: AFTER_ANSWER,
        candidates: [{ item: 'situation', text: '축제 부스 대기 줄이 길었다' }],
      });
      const res = await answer(token, expId, { text: '  축제 부스 대기 줄이 너무 길었어요  ' }).expect(200);
      const body = res.body as AnswerBody;
      expect(Object.keys(body).sort()).toEqual(['answer', 'itemStatus', 'newCandidates', 'question']);
      expect(body.answer).toMatchObject({ role: 'user', text: '축제 부스 대기 줄이 너무 길었어요' });
      expect(body.answer.createdAt).toMatch(ISO);
      expect(body.question).toMatchObject({ role: 'ai', text: '그때 맡은 역할은 무엇이었나요?' });
      expect(body.question.createdAt).toMatch(ISO);
      expect(Date.parse(body.answer.createdAt)).toBeLessThanOrEqual(Date.parse(body.question.createdAt));
      expect(body.itemStatus).toEqual(AFTER_ANSWER);
      expect(body.newCandidates).toHaveLength(1);
      expect(body.newCandidates[0]).toMatchObject({
        item: 'situation',
        text: '축제 부스 대기 줄이 길었다',
        status: 'candidate',
        source: 'ai_unverified',
        origin: 'conversation',
        clueId: null,
      });

      // 입력에 방금 쓴 답이 대화 기록으로 들어가야 AI가 그 답을 보고 다음 질문을 만든다.
      const answerCalls = () => fake.calls.filter((c) => c.task === 'conversation-answer');
      expect(answerCalls()).toHaveLength(1);
      expect(answerCalls()[0].user).toContain('그때 어떤 상황이었나요?');
      expect(answerCalls()[0].user).toContain('축제 부스 대기 줄이 너무 길었어요');

      const conv = (await getConversation(token, expId).expect(200)).body as ConversationBody;
      expect(conv.messages.map((m) => m.role)).toEqual(['ai', 'user', 'ai']);
      expect(conv.messages[1]).toEqual(body.answer);
      expect(conv.messages[2]).toEqual(body.question);
      expect(conv.itemStatus).toEqual(AFTER_ANSWER);
      expect(conv.candidates).toEqual(body.newCandidates);

      let exp = await experienceBody(token, expId);
      expect(exp.candidates).toEqual(body.newCandidates);
      expect(Object.values(exp.card).flat()).toEqual([]);

      fake.queue('conversation-answer', {
        question: '어떤 행동을 했나요?',
        itemStatus: { ...AFTER_ANSWER, role: 'explained' },
        candidates: [
          { item: 'role', text: '부스 동선 담당' },
          { item: 'action', text: '대기 번호표를 만들었다' },
        ],
      });
      const second = (await answer(token, expId, { text: '저는 동선 담당이었고 번호표를 만들었어요' }).expect(200))
        .body as AnswerBody;
      expect(second.newCandidates).toHaveLength(2);
      // 이전 답들도 대화 기록으로 계속 넘어가야 같은 질문을 되묻지 않는다.
      expect(answerCalls()).toHaveLength(2);
      expect(answerCalls()[1].user).toContain('축제 부스 대기 줄이 너무 길었어요');

      exp = await experienceBody(token, expId);
      expect(exp.candidates).toHaveLength(3);
      expect(Object.values(exp.card).flat()).toEqual([]);
      expect(((await getConversation(token, expId)).body as ConversationBody).messages).toHaveLength(5);
    });

    // 대화 중에 올린 단서도 다음 질문부터 반영된다(api.md 5절): 매 답마다 그 시점의 단서 전체를 넣는다.
    it('clue added between answers → next AI input contains it', async () => {
      const { token, expId } = await startedExperience('ans-clue@example.com');
      fake.queue('conversation-answer', { question: 'Q2', itemStatus: AFTER_ANSWER, candidates: [] });
      await answer(token, expId, { text: '첫 답입니다' }).expect(200);
      expect(fake.calls[fake.calls.length - 1].user).not.toContain('새로 찾은 회의록');

      await http()
        .post(`/api/experiences/${expId}/clues`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'text', text: '새로 찾은 회의록: 번호표 도입 결정' })
        .expect(201);
      await fileClue(token, expId, 'hidden-name.pdf', '번호표 사진 설명');

      fake.queue('conversation-answer', { question: 'Q3', itemStatus: AFTER_ANSWER, candidates: [] });
      await answer(token, expId, { text: '두 번째 답입니다' }).expect(200);
      const input = fake.calls[fake.calls.length - 1].user;
      expect(input).toContain('새로 찾은 회의록: 번호표 도입 결정');
      expect(input).toContain('번호표 사진 설명');
      expect(input).not.toContain('hidden-name');
      expect(input).toContain('첫 답입니다');
      expect(input).toContain('두 번째 답입니다');
    });

    // AI가 실패하면 사용자 답도 저장하지 않아야 다시 보낼 때 대화가 겹치지 않는다(C2).
    it('AI failure or out-of-schema reply → 502, messages/candidates/itemStatus unchanged', async () => {
      const { token, expId } = await startedExperience('ans-fail@example.com');
      fake.queue('conversation-answer', {
        question: 'Q2',
        itemStatus: AFTER_ANSWER,
        candidates: [{ item: 'situation', text: '이미 있던 후보' }],
      });
      await answer(token, expId, { text: '첫 답' }).expect(200);
      const before = (await getConversation(token, expId)).body as ConversationBody;

      fake.fail('conversation-answer');
      const res = await answer(token, expId, { text: '저장되면 안 되는 답' }).expect(502);
      expect((res.body as { error: { code: string } }).error.code).toBe('AI_UNAVAILABLE');

      // 스키마 밖 후보(없는 item·빈 text)도 실패로 처리해 반쯤 저장되지 않게 한다(AI 응답은 믿지 않는다).
      fake.queue('conversation-answer', {
        question: 'Q3',
        itemStatus: AFTER_ANSWER,
        candidates: [{ item: 'salary', text: '연봉' }],
      });
      await answer(token, expId, { text: '저장되면 안 되는 답' }).expect(502);
      fake.queue('conversation-answer', {
        question: 'Q3',
        itemStatus: AFTER_ANSWER,
        candidates: [{ item: 'action', text: '  ' }],
      });
      await answer(token, expId, { text: '저장되면 안 되는 답' }).expect(502);

      const after = (await getConversation(token, expId)).body as ConversationBody;
      expect(after.messages).toHaveLength(before.messages.length);
      expect(after.candidates).toHaveLength(before.candidates.length);
      expect(after.itemStatus).toEqual(before.itemStatus);
      expect(JSON.stringify(after)).not.toContain('저장되면 안 되는 답');
    });

    // 남의 경험에는 답을 남길 수 없고 존재 여부도 새면 안 된다(R1). AI도 불리면 안 된다.
    it("other user's experience / bad id / missing id → 404, no token → 401, no AI call", async () => {
      const { token: owner, expId } = await startedExperience('ans-owner@example.com');
      const other = await signup('ans-other@example.com');
      fake.reset();
      await answer(other, expId, { text: '남의 답' }).expect(404);
      await answer(owner, 'not-an-id', { text: '답' }).expect(404);
      await answer(owner, '64b7f0000000000000000000', { text: '답' }).expect(404);
      await http().post(`/api/experiences/${expId}/conversation/answers`).send({ text: '답' }).expect(401);
      expect(fake.calls).toHaveLength(0);
    });
  });
});
