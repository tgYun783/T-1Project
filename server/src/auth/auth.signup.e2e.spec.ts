import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../main';
import { ServerModule } from '../server.module';

const SEED_EMAIL = 'seed@example.com';

// S1(가입)은 주최 측 E2E의 첫 흐름이다. 실제 Mongo·세션 미들웨어를 거친 운영 경로(ServerModule)로 검증한다.
describe('C2-1 POST /api/auth/signup', () => {
  const savedEnv = { ...process.env };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.DATABASE_URL = mongod.getUri('signup');
    process.env.SESSION_SECRET = 'test-secret';
    process.env.SEED_USER_EMAIL = SEED_EMAIL;
    process.env.SEED_USER_PASSWORD = 'seed-password';
    app = await createApp(ServerModule);
    await app.init();
    server = app.getHttpServer() as Server;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    process.env = { ...savedEnv };
  });

  const signup = (body: unknown) => request(server).post('/api/auth/signup').send(body as object);
  const errorOf = (res: request.Response) =>
    (res.body as { error: { code: string; details?: { field: string }[] } }).error;

  // 응답 모양이 api.md 3절과 정확히 같아야 프런트가 그대로 쓰고, 비밀번호 해시가 새지 않는다.
  it('201 with public user only and a session cookie', async () => {
    const res = await signup({ email: 'New@Example.com', password: 'password1' });
    expect(res.status).toBe(201);
    const user = (res.body as { user: Record<string, unknown> }).user;
    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'role']);
    expect(user.email).toBe('new@example.com');
    expect(user.role).toBe('취준생');
    expect(typeof user.id).toBe('string');
    expect(typeof user.createdAt).toBe('string');
    expect(new Date(user.createdAt as string).toISOString()).toBe(user.createdAt);

    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const sid = cookies.find((c) => c.startsWith('sid='));
    expect(sid).toBeDefined();
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toContain('$2');
  });

  // 잘못된 입력은 어느 칸이 틀렸는지 details.field로 알려야 화면이 해당 칸에 오류를 띄운다.
  it('400 VALIDATION with field=email for a malformed email', async () => {
    const res = await signup({ email: 'not-an-email', password: 'password1' });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION');
    expect(errorOf(res).details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email' })]));
  });

  it('400 VALIDATION with field=password for a 7-char password', async () => {
    const res = await signup({ email: 'short@example.com', password: 'short7!' });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION');
    expect(errorOf(res).details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
    );
  });

  // 빠지거나 문자열이 아닌 값이 500으로 새지 않고 400으로 막혀야 한다.
  it.each([
    [{}, ['email', 'password']],
    [{ email: 'x@example.com' }, ['password']],
    [{ password: 'password1' }, ['email']],
    [{ email: 123, password: 'password1' }, ['email']],
    [{ email: 'y@example.com', password: 12345678 }, ['password']],
  ])('400 VALIDATION for missing/non-string body %j', async (body, fields) => {
    const res = await signup(body);
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION');
    const got = (errorOf(res).details ?? []).map((d) => d.field).sort();
    expect(got).toEqual([...fields].sort());
  });

  // 이메일은 대소문자를 구분하지 않으므로 대소문자만 다른 재가입도 중복이다.
  it('409 EMAIL_TAKEN for a duplicate email (case-insensitive)', async () => {
    const first = await signup({ email: 'dup@example.com', password: 'password1' });
    expect(first.status).toBe(201);
    const res = await signup({ email: 'DUP@Example.com', password: 'password2' });
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('EMAIL_TAKEN');
  });

  // 시드 계정을 가로채는 가입이 막혀야 주최 측 로그인이 깨지지 않는다.
  it('409 EMAIL_TAKEN for the seed email', async () => {
    const res = await signup({ email: SEED_EMAIL, password: 'password1' });
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('EMAIL_TAKEN');
  });
});
