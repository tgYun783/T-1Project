import { RequestHandler } from 'express';
import session from 'express-session';
import { MongoStore } from 'connect-mongo';
import { Connection } from 'mongoose';

// 세션에는 userId만 둔다(명세 02 결정).
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

// 비밀이 비면 누구나 쿠키를 위조할 수 있으므로 임의값으로 넘어가지 않고 기동을 실패시킨다.
export function sessionSecretFromEnv(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET 환경변수가 비어 세션 쿠키를 서명할 수 없습니다.');
  }
  return secret;
}

// 세션을 앱과 같은 Mongo 연결의 sessions 컬렉션에 저장한다: 재시작해도 로그인이 유지되고 연결을 하나만 쓴다.
export function createSessionMiddleware(connection: Connection): RequestHandler {
  return session({
    name: 'sid',
    secret: sessionSecretFromEnv(),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
    store: MongoStore.create({
      client: connection.getClient(),
      dbName: connection.db?.databaseName,
      collectionName: 'sessions',
    }),
  });
}
