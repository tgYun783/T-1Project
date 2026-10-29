import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { ChecksModule } from './checks/checks.module';
import { CoverLettersModule } from './cover-letters/cover-letters.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { mongooseOptionsFromEnv, ServerModule } from './server.module';
import { UsersModule } from './users/users.module';

describe('C1-6 server module (DB connection)', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  // 대회 규칙: DB 주소는 환경변수 DATABASE_URL에서만 읽는다(compose가 mongodb://db:27017/app을 넣는다).
  it('builds the mongoose uri from DATABASE_URL', () => {
    process.env.DATABASE_URL = 'mongodb://db:27017/app';
    expect(mongooseOptionsFromEnv()).toEqual({ uri: 'mongodb://db:27017/app' });
  });

  // DATABASE_URL이 없을 때 조용히 건너뛰면 시드 누락이 숨겨지므로 기동 시 바로 실패시킨다.
  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => mongooseOptionsFromEnv()).toThrow('DATABASE_URL');
  });

  // 운영 진입점이 HTTP 기능(AppModule)과 DB·시드(UsersModule)를 함께 올려야 기동 시 시드가 돈다.
  it('ServerModule imports AppModule and UsersModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServerModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([AppModule, UsersModule]));
  });

  // 계정 API는 DB가 필요하므로 운영 진입점에서만 올린다. 빠지면 /api/auth/signup이 404가 된다.
  it('ServerModule imports AuthModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServerModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([AuthModule]));
  });

  // 경험 API도 DB가 필요해 운영 진입점에서 올린다. 빠지면 /api/experiences가 404가 된다.
  it('ServerModule imports ExperiencesModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServerModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([ExperiencesModule]));
  });

  // 자소서 API도 DB가 필요해 운영 진입점에서 올린다. 빠지면 /api/cover-letters가 404가 된다.
  it('ServerModule imports CoverLettersModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServerModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([CoverLettersModule]));
  });

  // 점검 API도 DB가 필요해 운영 진입점에서 올린다. 빠지면 /api/cover-letters/:id/checks가 404가 된다.
  it('ServerModule imports ChecksModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServerModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([ChecksModule]));
  });
});
