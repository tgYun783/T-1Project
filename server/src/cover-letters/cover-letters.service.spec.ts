import * as os from 'node:os';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { FakeAiService } from '../ai/fake-ai.service';
import { CoverLettersModule } from './cover-letters.module';
import { CoverLettersService } from './cover-letters.service';

type MarkChanged = { markChanged: (...args: unknown[]) => Promise<unknown> };

// 명세 08이 「점검 오래됨」 표시를 markChanged 한 곳에 붙인다: 자소서를 바꾸는 API가 이 함수를 우회하면 오래됨 표시가 빠진다.
describe('C7-6 CoverLettersService change notification', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: CoverLettersService;
  let spy: jest.SpyInstance;
  const fake = new FakeAiService();
  const userId = String(new Types.ObjectId());

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }), CoverLettersModule],
    })
      .overrideProvider(AiService)
      .useValue(fake)
      .compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(CoverLettersService);
  }, 120_000);

  beforeEach(() => {
    fake.reset();
    // 원래 구현은 그대로 실행하고 호출만 센다(저장 결과가 실제로 남아야 이후 단계를 이어 갈 수 있다).
    spy = jest.spyOn(service as unknown as MarkChanged, 'markChanged');
  });

  afterEach(async () => {
    spy.mockRestore();
    await connection.collection('coverLetters').deleteMany({});
    await connection.collection('experiences').deleteMany({});
    await connection.collection('facts').deleteMany({});
  });

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  async function confirmedExperience(): Promise<string> {
    const now = new Date();
    const exp = await connection.collection('experiences').insertOne({
      userId: new Types.ObjectId(userId),
      title: '축제 운영',
      period: '2025',
      itemStatus: { situation: null, role: null, action: null, result: null, meaning: null },
      createdAt: now,
      updatedAt: now,
    });
    await connection.collection('facts').insertOne({
      experienceId: exp.insertedId,
      userId: new Types.ObjectId(userId),
      item: 'action',
      text: '부스 동선을 다시 짰다',
      status: 'confirmed',
      source: 'said',
      clueId: null,
      origin: 'manual',
      createdAt: now,
    });
    return String(exp.insertedId);
  }

  it('create APIs do not go through markChanged (nothing existing changed)', async () => {
    await service.createPasted(userId, { title: null, body: '글' });
    await service.createGenerated(userId, { title: null, preferred: '우대', talent: '인재', questions: ['문항'] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('PATCH cover letter, PATCH item, and POST answer each call markChanged exactly once', async () => {
    const pasted = await service.createPasted(userId, { title: null, body: '글' });
    await service.update(userId, pasted.id, { body: '고친 글' });
    expect(spy).toHaveBeenCalledTimes(1);

    const expId = await confirmedExperience();
    const cl = await service.createGenerated(userId, {
      title: null,
      preferred: '우대',
      talent: '인재',
      questions: ['문항'],
    });
    const itemId = cl.items[0].id;
    await service.selectExperiences(userId, cl.id, itemId, [expId]);
    fake.queue('cover-letter-answer', { answer: '응답' });
    spy.mockClear();
    await service.generateAnswer(userId, cl.id, itemId, { confirmOverwrite: false });
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    await service.updateItem(userId, cl.id, itemId, { answer: '고친 응답' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // 추천·선택은 응답 글을 바꾸지 않는다(C4): 변경 알림을 보내면 08이 멀쩡한 점검을 오래됨으로 표시한다.
  it('recommendations and experience selection do not call markChanged', async () => {
    const expId = await confirmedExperience();
    const cl = await service.createGenerated(userId, {
      title: null,
      preferred: '우대',
      talent: '인재',
      questions: ['문항'],
    });
    const itemId = cl.items[0].id;
    fake.queue('cover-letter-recommend', { recommendations: [{ experienceId: expId, reason: '맞음' }] });
    await service.recommend(userId, cl.id, itemId);
    await service.selectExperiences(userId, cl.id, itemId, [expId]);
    expect(spy).not.toHaveBeenCalled();
  });
});
