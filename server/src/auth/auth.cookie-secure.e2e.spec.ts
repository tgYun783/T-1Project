import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../main';
import { ServerModule } from '../server.module';
import { cookieSecureFromEnv } from './session';

const SEED_EMAIL = 'seed@example.com';
const SEED_PASSWORD = 'seed-password';

const sidOf = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));

// compose 기본값 "false"를 문자열 그대로 truthy로 읽으면 HTTP 로컬에서 쿠키가 안 붙어 로그인이 끊긴다.
describe('C2-5 cookieSecureFromEnv', () => {
  const saved = process.env.COOKIE_SECURE;
  afterEach(() => {
    if (saved === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = saved;
  });

  it.each([[undefined], [''], ['false'], ['False'], ['0'], ['no']])('is false for %j', (value) => {
    if (value === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = value;
    expect(cookieSecureFromEnv()).toBe(false);
  });

  it.each([['true'], ['TRUE'], ['True']])('is true for %j', (value) => {
    process.env.COOKIE_SECURE = value;
    expect(cookieSecureFromEnv()).toBe(true);
  });
});

// 운영 경로(ServerModule·세션 미들웨어)를 COOKIE_SECURE 값만 바꿔 띄운다: 쿠키 옵션은 앱 생성 시점에 정해진다.
async function startApp(dbName: string, cookieSecure: string | undefined) {
  const mongod = await MongoMemoryServer.create();
  process.env.DATABASE_URL = mongod.getUri(dbName);
  process.env.SESSION_SECRET = 'test-secret';
  process.env.SEED_USER_EMAIL = SEED_EMAIL;
  process.env.SEED_USER_PASSWORD = SEED_PASSWORD;
  if (cookieSecure === undefined) delete process.env.COOKIE_SECURE;
  else process.env.COOKIE_SECURE = cookieSecure;
  const app = await createApp(ServerModule);
  await app.init();
  return { mongod, app, server: app.getHttpServer() as Server };
}

// compose 로컬(HTTP)에서 Secure 쿠키가 나가면 브라우저가 쿠키를 버려 로그인 직후 401이 된다.
describe('C2-5 COOKIE_SECURE unset (compose default)', () => {
  const savedEnv = { ...process.env };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    ({ mongod, app, server } = await startApp('cookie-default', undefined));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    process.env = { ...savedEnv };
  });

  it('login and logout set sid without Secure', async () => {
    const login = await request(server).post('/api/auth/login').send({ email: SEED_EMAIL, password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    const sid = sidOf(login);
    expect(sid).toBeDefined();
    expect(sid).not.toMatch(/;\s*Secure/i);

    const logout = await request(server)
      .post('/api/auth/logout')
      .set('Cookie', sid!.split(';')[0]);
    expect(logout.status).toBe(204);
    expect(sidOf(logout)).not.toMatch(/;\s*Secure/i);
  });
});

// HTTPS 배포는 nginx/플랫폼 프록시 뒤에서 HTTP로 받으므로, X-Forwarded-Proto를 믿어야 Secure 쿠키가 발급된다.
describe('C2-5 COOKIE_SECURE=true behind a TLS-terminating proxy', () => {
  const savedEnv = { ...process.env };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    ({ mongod, app, server } = await startApp('cookie-secure', 'true'));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    process.env = { ...savedEnv };
  });

  // trust proxy가 없으면 express-session은 HTTP 요청에 Secure 쿠키를 발급하지 않으므로 이 테스트가 신뢰 설정을 검증한다.
  it('login sets sid with Secure, me works with it, logout clears it with Secure', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    const sid = sidOf(login);
    expect(sid).toBeDefined();
    expect(sid).toMatch(/;\s*Secure/i);
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);

    const cookie = sid!.split(';')[0];
    const me = await request(server).get('/api/auth/me').set('X-Forwarded-Proto', 'https').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect((me.body as { user: { email: string } }).user.email).toBe(SEED_EMAIL);

    const logout = await request(server)
      .post('/api/auth/logout')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(sidOf(logout)).toMatch(/;\s*Secure/i);
  });
});
