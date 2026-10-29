import { createHmac } from 'node:crypto';
import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { createApp } from '../main';
import { ServerModule } from '../server.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

const SEED_EMAIL = 'seed@example.com';
const SEED_PASSWORD = 'seed-password';

// express-session(cookie-signature)과 같은 방식(HMAC-SHA256, base64, 끝 '=' 제거)으로 다른 비밀의 서명을 만든다.
function signWith(value: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '');
  return `${value}.${sig}`;
}

// 보호 경로는 가드 하나에 기대므로, 가드 적용·위조 쿠키 거부·세션 저장 위치를 운영 경로(ServerModule)로 확인한다.
describe('C2-4 AuthGuard, forged cookies, sessions collection', () => {
  const savedEnv = { ...process.env };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let server: Server;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.DATABASE_URL = mongod.getUri('auth-guard');
    process.env.SESSION_SECRET = 'test-secret';
    process.env.SEED_USER_EMAIL = SEED_EMAIL;
    process.env.SEED_USER_PASSWORD = SEED_PASSWORD;
    app = await createApp(ServerModule);
    await app.init();
    server = app.getHttpServer() as Server;
    connection = app.get<Connection>(getConnectionToken());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    process.env = { ...savedEnv };
  });

  const errorOf = (res: request.Response) => (res.body as { error: { code: string } }).error;
  const sidOf = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));

  const loginCookie = async (): Promise<string> => {
    const res = await request(server).post('/api/auth/login').send({ email: SEED_EMAIL, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    const sid = sidOf(res);
    expect(sid).toBeDefined();
    return (sid as string).split(';')[0];
  };

  // 「AuthGuard가 적용된」을 직접 본다: 핸들러 안 검사로 되돌아가면 다른 보호 경로가 같은 가드를 재사용할 수 없다.
  it('AuthController.me is decorated with AuthGuard', () => {
    const handler = Object.getOwnPropertyDescriptor(AuthController.prototype, 'me')?.value as object;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toContain(AuthGuard);
  });

  it('401 UNAUTHENTICATED without a cookie', async () => {
    const res = await request(server).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  // 진짜 세션 id에 서명만 바꾼 쿠키: 서명 검증이 없으면 sid 추측만으로 남의 세션을 쓸 수 있다.
  it('401 for a real session id with a tampered signature', async () => {
    const cookie = await loginCookie();
    const ok = await request(server).get('/api/auth/me').set('Cookie', cookie);
    expect(ok.status).toBe(200);

    const value = decodeURIComponent(cookie.slice('sid='.length));
    const id = value.slice(2, value.lastIndexOf('.'));
    const tampered = `sid=${encodeURIComponent(`s:${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)}`;
    const res = await request(server).get('/api/auth/me').set('Cookie', tampered);
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  // 형식이 깨진 쿠키는 401이어야 하고 500으로 터지면 안 된다(AGENT.md: 오류 응답에 스택 금지).
  it.each(['sid=s%3Afake.fake', 'sid=random'])('401 (not 500) for malformed cookie %s', async (cookie) => {
    const res = await request(server).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  // SESSION_SECRET를 모르는 사람이 만든 서명은 거부돼야 한다: 비밀이 쿠키 위조를 막는 유일한 장치다.
  it('401 for a session id signed with a wrong secret', async () => {
    const cookie = await loginCookie();
    const value = decodeURIComponent(cookie.slice('sid='.length));
    const id = value.slice(2, value.lastIndexOf('.'));
    const forged = `sid=${encodeURIComponent(`s:${signWith(id, 'wrong-secret')}`)}`;
    const res = await request(server).get('/api/auth/me').set('Cookie', forged);
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  // 세션이 Mongo sessions 컬렉션에 있어야 재시작해도 로그인이 유지되고, 문서에는 userId만 있어야 한다(명세 02 결정).
  it('stores the session in the sessions collection with userId only, and removes it on logout', async () => {
    const agent = request.agent(server);
    const login = await agent.post('/api/auth/login').send({ email: SEED_EMAIL, password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    const userId = (login.body as { user: { id: string } }).user.id;
    const value = decodeURIComponent((sidOf(login) as string).split(';')[0].slice('sid='.length));
    const id = value.slice(2, value.lastIndexOf('.'));

    const sessions = connection.collection<{ _id: string; session: unknown }>('sessions');
    expect(await sessions.countDocuments()).toBeGreaterThanOrEqual(1);
    const doc = await sessions.findOne({ _id: id });
    expect(doc).not.toBeNull();
    const raw = (doc as { session: unknown }).session;
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { userId?: string };
    expect(data.userId).toBe(userId);
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toContain('$2');

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(await sessions.findOne({ _id: id })).toBeNull();
  });
});
