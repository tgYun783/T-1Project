import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../main';
import { ServerModule } from '../server.module';

const SEED_EMAIL = 'seed@example.com';
const SEED_PASSWORD = 'seed-password';

// 주최 측 E2E는 빈 DB에서 시드 계정으로 바로 로그인하므로, 운영 경로(ServerModule·SeedService·세션)로 검증한다.
describe('C2-2 POST /api/auth/login', () => {
  const savedEnv = { ...process.env };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.DATABASE_URL = mongod.getUri('login');
    process.env.SESSION_SECRET = 'test-secret';
    process.env.SEED_USER_EMAIL = SEED_EMAIL;
    process.env.SEED_USER_PASSWORD = SEED_PASSWORD;
    app = await createApp(ServerModule);
    await app.init();
    server = app.getHttpServer() as Server;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    process.env = { ...savedEnv };
  });

  const login = (body: unknown) => request(server).post('/api/auth/login').send(body as object);
  const errorOf = (res: request.Response) => (res.body as { error: { code: string; message: string } }).error;
  const sidOf = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));

  // 시드 계정 로그인이 되어야 주최 측 흐름이 시작된다. 응답 모양은 api.md 3절과 같고 해시가 새지 않아야 한다.
  it('200 with public user and a session cookie for the seed account', async () => {
    const res = await login({ email: SEED_EMAIL, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object)).toEqual(['user']);
    const user = (res.body as { user: Record<string, unknown> }).user;
    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'role']);
    expect(user.email).toBe(SEED_EMAIL);
    expect(user.role).toBe('취준생');

    const sid = sidOf(res);
    expect(sid).toBeDefined();
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toContain('$2');
  });

  // 저장 시 소문자로 정규화하므로 로그인도 대소문자를 구분하지 않아야 같은 계정으로 들어간다.
  it('200 when the email differs only in case', async () => {
    const res = await login({ email: 'SEED@Example.com', password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect((res.body as { user: { email: string } }).user.email).toBe(SEED_EMAIL);
  });

  // 틀린 비밀번호와 없는 이메일이 같은 코드·메시지여야 가입 여부를 엿볼 수 없다.
  it('401 INVALID_CREDENTIALS with the same message for wrong password and unknown email', async () => {
    const wrong = await login({ email: SEED_EMAIL, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe('INVALID_CREDENTIALS');
    expect(sidOf(wrong)).toBeUndefined();

    const unknown = await login({ email: 'nobody@example.com', password: SEED_PASSWORD });
    expect(unknown.status).toBe(401);
    expect(errorOf(unknown).code).toBe('INVALID_CREDENTIALS');
    expect(sidOf(unknown)).toBeUndefined();

    expect(errorOf(unknown).message).toBe(errorOf(wrong).message);
  });

  // 빠지거나 문자열이 아닌 입력이 500으로 새지 않고 400 VALIDATION으로 막혀야 한다.
  it.each([[{}], [{ email: 1, password: SEED_PASSWORD }], [{ email: SEED_EMAIL }]])(
    '400 VALIDATION (not 500) for malformed body %j',
    async (body) => {
      const res = await login(body);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION');
    },
  );
});
