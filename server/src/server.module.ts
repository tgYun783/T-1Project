import { Module } from '@nestjs/common';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { ChecksModule } from './checks/checks.module';
import { CoverLettersModule } from './cover-letters/cover-letters.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { UsersModule } from './users/users.module';

// 대회 규칙상 DB 주소는 DATABASE_URL에서만 읽는다. 없으면 시드 누락을 숨기지 않도록 기동을 실패시킨다.
export function mongooseOptionsFromEnv(): MongooseModuleOptions {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    throw new Error('DATABASE_URL 환경변수가 비어 있어 MongoDB에 연결할 수 없습니다.');
  }
  return { uri };
}

// 운영 진입점: HTTP 기능(AppModule)에 Mongo 연결과 시드(UsersModule)·계정 API(AuthModule)를 더한다.
// AppModule은 DB 없이도 조립되므로 HTTP 테스트는 Mongo 없이 돈다.
@Module({
  imports: [
    MongooseModule.forRootAsync({ useFactory: mongooseOptionsFromEnv }),
    UsersModule,
    AuthModule,
    ExperiencesModule,
    CoverLettersModule,
    ChecksModule,
    AppModule,
  ],
})
export class ServerModule {}
