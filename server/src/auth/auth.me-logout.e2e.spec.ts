import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../main';
import { ServerModule } from '../server.module';

const SEED_EMAIL = 'seed@example.com';
const SEED_PASSWORD = 'seed-password';

// 프런트는 me로 로그인 여부를 판단하고 logout 뒤 보호 화면을 막으므로, 운영 경로(ServerModule·세션 저장소)로 검증한다.
describe('C2-3 GET /api/auth/me, POST /api/auth/logout', () => {
  const savedEnv = { ...process.env };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.DATABASE_URL = mongod.getUri('me-logout');
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

  const errorOf = (res: request.Response) => (res.body as { error: { code: string } }).error;
  const sidOf = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));

  // 세션 없는 요청이 사용자 정보를 받으면 안 된다(api.md 1절 UNAUTHENTICATED).
  it('401 UNAUTHENTICATED for me without a cookie', async () => {
    const res = await request(server).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  // 로그인 → me → logout → me 순서로 세션 수명 전체를 확인한다.
  it('me returns the user while logged in, logout returns 204 and me becomes 401', async () => {
    const agent = request.agent(server);
    const loginRes = await agent.post('/api/auth/login').send({ email: SEED_EMAIL, password: SEED_PASSWORD });
    expect(loginRes.status).toBe(200);
    const loginSid = sidOf(loginRes);
    expect(loginSid).toBeDefined();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    const user = (me.body as { user: Record<string, unknown> }).user;
    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'role']);
    expect(user.email).toBe(SEED_EMAIL);
    expect(user.role).toBe('취준생');
    const text = JSON.stringify(me.body);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toContain('$2');

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(out.text).toBe('');
    // 브라우저가 쿠키를 지우도록 만료된 sid를 내려 줘야 한다.
    const cleared = sidOf(out);
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/^sid=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);

    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
    expect(errorOf(after).code).toBe('UNAUTHENTICATED');

    // 쿠키만 지우는 가짜 로그아웃을 막는다: 예전 sid를 그대로 보내도 서버 세션이 파기돼 401이어야 한다.
    const oldCookie = (loginSid as string).split(';')[0];
    const replay = await request(server).get('/api/auth/me').set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    expect(errorOf(replay).code).toBe('UNAUTHENTICATED');
  });

  // 비로그인 logout은 멱등하게 204: 프런트가 상태와 상관없이 로그아웃을 호출해도 오류 처리가 필요 없다.
  it('204 for logout without a cookie (idempotent)', async () => {
    const res = await request(server).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});
