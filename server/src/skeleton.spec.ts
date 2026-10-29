import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { createApp } from './main';

const serverRoot = join(__dirname, '..');
const readLines = (file: string) =>
  readFileSync(join(serverRoot, file), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

describe('C1-1 server skeleton', () => {
  // 대회 규칙: 의존성·빌드 산출물·비밀값이 커밋되면 주최 측이 저장소를 못 읽거나 비밀이 샌다.
  it('server/.gitignore excludes node_modules, dist, .env', () => {
    const lines = readLines('.gitignore');
    expect(lines).toEqual(expect.arrayContaining(['node_modules/', 'dist/', '.env']));
  });

  // 환경변수 이름은 대회가 고정한 것만 쓴다. 예시 파일에 값(비밀)이 들어가면 안 된다.
  it('server/.env.example lists only the spec env names, with empty values', () => {
    const entries = readLines('.env.example').map((line) => line.split('='));
    expect(entries.map(([name]) => name).sort()).toEqual(
      [
        'AI_GATEWAY_API_KEY',
        'COOKIE_SECURE',
        'DATABASE_URL',
        'RELEASE_ID',
        'SEED_USER_EMAIL',
        'SEED_USER_PASSWORD',
        'SESSION_SECRET',
      ].sort(),
    );
    for (const [, value] of entries) expect(value ?? '').toBe('');
  });

  // 루트 모듈이 DI 오류 없이 조립돼야 이후 모든 기능 모듈을 얹을 수 있다.
  it('AppModule compiles', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
    await moduleRef.close();
  });

  // main.ts가 쓰는 앱 생성 함수가 실제로 초기화되는지(전역 prefix 포함) 확인한다.
  it('createApp initializes a Nest application', async () => {
    const app = await createApp();
    await app.init();
    expect(app.getHttpServer()).toBeDefined();
    await app.close();
  });
});
