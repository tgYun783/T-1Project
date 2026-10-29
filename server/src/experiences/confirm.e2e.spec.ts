import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AiService } from '../ai/ai.service';
import { FakeAiService } from '../ai/fake-ai.service';
import { AuthModule } from '../auth/auth.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { UsersModule } from '../users/users.module';
import { ExperiencesModule } from './experiences.module';

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

interface ExperienceBody {
  itemStatus: Record<string, string | null>;
  card: Record<string, FactBody[]>;
  candidates: FactBody[];
}

interface ErrorBody {
  error: { code: string; details?: { field: string }[] };
}

const ITEMS = ['situation', 'role', 'action', 'result', 'meaning'];
const FIRST_STATUS = { situation: 'needs_more', role: null, action: null, result: null, meaning: null };
const AFTER_ANSWER = { situation: 'explained', role: 'needs_more', action: null, result: null, meaning: null };

// 후보 확정(api.md 6절, 명세 06 C6-3). 사용자가 확인한 후보만 카드에 들어가야 자소서 근거가 검증된 사실이 된다(C1).
describe('Fact candidate confirm (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
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

  async function textClue(token: string, expId: string): Promise<string> {
    const res = await http()
      .post(`/api/experiences/${expId}/clues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'text', text: '회의록: 부스 동선 재배치' })
      .expect(201);
    return (res.body as { clue: { id: string } }).clue.id;
  }

  async function experienceBody(token: string, expId: string): Promise<ExperienceBody> {
    const res = await http().get(`/api/experiences/${expId}`).set('Authorization', `Bearer ${token}`).expect(200);
    return (res.body as { experience: ExperienceBody }).experience;
  }

  // 실제 흐름처럼 대화를 거쳐 AI 후보(candidate·ai_unverified·conversation)를 만든다.
  async function withCandidates(email: string): Promise<{ token: string; expId: string; candidates: FactBody[] }> {
    const token = await signup(email);
    const expId = await createExperience(token);
    fake.queue('conversation-start', { question: '그때 어떤 상황이었나요?', itemStatus: FIRST_STATUS });
    await http().post(`/api/experiences/${expId}/conversation/start`).set('Authorization', `Bearer ${token}`).expect(200);
    fake.queue('conversation-answer', {
      question: '맡은 역할은요?',
      itemStatus: AFTER_ANSWER,
      candidates: [
        { item: 'situation', text: '축제 부스 대기 줄이 길었다' },
        { item: 'role', text: '동선 담당이었다' },
        { item: 'action', text: '번호표를 만들었다' },
      ],
    });
    const res = await http()
      .post(`/api/experiences/${expId}/conversation/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '대기 줄이 길어서 동선 담당으로 번호표를 만들었어요' })
      .expect(200);
    return { token, expId, candidates: (res.body as { newCandidates: FactBody[] }).newCandidates };
  }

  function confirm(token: string, expId: string, factId: string, body: unknown) {
    return http()
      .post(`/api/experiences/${expId}/facts/${factId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
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
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  beforeEach(() => fake.reset());

  // 확정 전 후보는 카드에 없고, said 확정 뒤에만 카드로 옮겨진다. 확정은 대화 판정이 아니므로 itemStatus는 그대로다(api.md 5절 끝).
  it('said confirm → 200 {fact} confirmed, moves from candidates to card, itemStatus unchanged', async () => {
    const { token, expId, candidates } = await withCandidates('confirm-said@example.com');
    const before = await experienceBody(token, expId);
    expect(Object.values(before.card).flat()).toEqual([]);
    expect(before.candidates.map((f) => f.id)).toContain(candidates[0].id);

    const res = await confirm(token, expId, candidates[0].id, { source: 'said' }).expect(200);
    const fact = (res.body as { fact: FactBody }).fact;
    expect(Object.keys(res.body as object)).toEqual(['fact']);
    expect(fact).toMatchObject({
      id: candidates[0].id,
      item: 'situation',
      text: '축제 부스 대기 줄이 길었다',
      status: 'confirmed',
      source: 'said',
      clueId: null,
      origin: 'conversation',
    });

    const after = await experienceBody(token, expId);
    expect(after.card.situation).toEqual([fact]);
    expect(after.candidates.map((f) => f.id)).not.toContain(fact.id);
    expect(after.candidates).toHaveLength(2);
    expect(after.itemStatus).toEqual(before.itemStatus);
    expect(fake.calls.filter((c) => c.task === 'conversation-answer')).toHaveLength(1);
  });

  // 사용자가 AI 문장을 고쳐 확정할 수 있어야 자기 말로 된 사실이 카드에 남는다(R4).
  it('confirm with text/item → saved with edited values in the new item of card', async () => {
    const { token, expId, candidates } = await withCandidates('confirm-edit@example.com');
    const res = await confirm(token, expId, candidates[1].id, {
      source: 'said',
      text: '  동선과 안내를 함께 맡았다  ',
      item: 'action',
    }).expect(200);
    const fact = (res.body as { fact: FactBody }).fact;
    expect(fact).toMatchObject({ item: 'action', text: '동선과 안내를 함께 맡았다', status: 'confirmed' });
    const exp = await experienceBody(token, expId);
    expect(exp.card.action).toEqual([fact]);
    expect(exp.card.role).toEqual([]);
  });

  // clue 출처는 이 경험 단서와 연결돼야 R5 출처 보기로 이어진다.
  it('clue confirm with this experience clue → 200, clueId saved', async () => {
    const { token, expId, candidates } = await withCandidates('confirm-clue@example.com');
    const clueId = await textClue(token, expId);
    const res = await confirm(token, expId, candidates[2].id, { source: 'clue', clueId }).expect(200);
    expect((res.body as { fact: FactBody }).fact).toMatchObject({ status: 'confirmed', source: 'clue', clueId });
  });

  // 확인 안 된 출처(ai_unverified)나 엉뚱한 단서로 확정되면 C1이 깨진다. 모두 400이고 후보는 그대로 남는다.
  it('bad source / missing clueId / other experience clue / blank text / bad item → 400, candidate unchanged', async () => {
    const { token, expId, candidates } = await withCandidates('confirm-bad@example.com');
    const otherExp = await createExperience(token);
    const otherClue = await textClue(token, otherExp);
    const cases: [unknown, string][] = [
      [{ source: 'ai_unverified' }, 'source'],
      [{}, 'source'],
      [{ source: 'guess' }, 'source'],
      [{ source: 'clue' }, 'clueId'],
      [{ source: 'clue', clueId: 'not-an-id' }, 'clueId'],
      [{ source: 'clue', clueId: otherClue }, 'clueId'],
      [{ source: 'said', text: '   ' }, 'text'],
      [{ source: 'said', item: 'feeling' }, 'item'],
    ];
    for (const [body, field] of cases) {
      const res = await confirm(token, expId, candidates[0].id, body).expect(400);
      const err = (res.body as ErrorBody).error;
      expect(err.code).toBe('VALIDATION');
      expect(err.details?.map((d) => d.field)).toEqual([field]);
    }
    const exp = await experienceBody(token, expId);
    expect(exp.candidates).toHaveLength(3);
    expect(Object.values(exp.card).flat()).toEqual([]);
  });

  // 이미 확정된 사실을 다시 확정하면 출처가 조용히 덮인다: 409 FACT_RESOLVED로 막는다.
  it('already confirmed (confirmed candidate or manual fact) → 409 FACT_RESOLVED', async () => {
    const { token, expId, candidates } = await withCandidates('confirm-twice@example.com');
    await confirm(token, expId, candidates[0].id, { source: 'said' }).expect(200);
    const again = await confirm(token, expId, candidates[0].id, { source: 'said', text: '덮어쓰기' }).expect(409);
    expect((again.body as ErrorBody).error.code).toBe('FACT_RESOLVED');

    const manual = await http()
      .post(`/api/experiences/${expId}/facts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ item: 'result', text: '대기 시간이 줄었다', source: 'said' })
      .expect(201);
    const manualId = (manual.body as { fact: FactBody }).fact.id;
    const res = await confirm(token, expId, manualId, { source: 'said' }).expect(409);
    expect((res.body as ErrorBody).error.code).toBe('FACT_RESOLVED');

    const exp = await experienceBody(token, expId);
    expect(exp.card.situation[0].text).toBe('축제 부스 대기 줄이 길었다');
  });

  // 남의 경험·남의 후보는 존재 여부도 알리지 않는다(R1): 모두 같은 404이고 후보는 확정되지 않는다.
  it("other user's experience / bad factId / other experience path → 404, no token → 401", async () => {
    const { token, expId, candidates } = await withCandidates('confirm-owner@example.com');
    const intruder = await signup('confirm-intruder@example.com');
    const intruderExp = await createExperience(intruder);
    await confirm(intruder, expId, candidates[0].id, { source: 'said' }).expect(404);
    await confirm(intruder, intruderExp, candidates[0].id, { source: 'said' }).expect(404);
    await confirm(token, expId, 'not-an-id', { source: 'said' }).expect(404);
    await confirm(token, expId, '0123456789abcdef01234567', { source: 'said' }).expect(404);
    await http().post(`/api/experiences/${expId}/facts/${candidates[0].id}/confirm`).send({ source: 'said' }).expect(401);

    const exp = await experienceBody(token, expId);
    expect(exp.candidates).toHaveLength(3);
    expect(ITEMS.flatMap((item) => exp.card[item])).toEqual([]);
  });
});
