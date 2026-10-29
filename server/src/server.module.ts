import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { InjectConnection, MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { createSessionMiddleware } from './auth/session';
import { UsersModule } from './users/users.module';

// 대회 규칙상 DB 주소는 DATABASE_URL에서만 읽는다. 없으면 시드 누락을 숨기지 않도록 기동을 실패시킨다.
export function mongooseOptionsFromEnv(): MongooseModuleOptions {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    throw new Error('DATABASE_URL 환경변수가 비어 있어 MongoDB에 연결할 수 없습니다.');
  }
  return { uri };
}

// 운영 진입점: HTTP 기능(AppModule)에 Mongo 연결과 시드(UsersModule)·인증(AuthModule)·세션을 더한다.
// AppModule은 DB 없이도 조립되므로 HTTP 테스트는 Mongo 없이 돈다.
@Module({
  imports: [
    MongooseModule.forRootAsync({ useFactory: mongooseOptionsFromEnv }),
    UsersModule,
    AuthModule,
    AppModule,
  ],
})
export class ServerModule implements NestModule {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  // 세션 저장소가 Mongo 연결에 묶이므로, 연결이 있는 이 진입점에서만 세션 미들웨어를 건다.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(createSessionMiddleware(this.connection)).forRoutes('{*splat}');
  }
}
