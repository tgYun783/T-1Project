import 'reflect-metadata';
import { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { ServerModule } from './server.module';

// 프런트는 상대 경로 /api/...로 부르고, 주최 측 검사는 prefix 없는 /__health를 본다.
// rootModule 인자는 테스트가 운영과 같은 설정(prefix·필터)으로 추가 컨트롤러를 띄우기 위한 것이다.
export async function createApp(rootModule: Type<unknown> = AppModule): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(rootModule, { logger: ['error', 'warn', 'log'] });
  // compose 안 nginx(또는 배포 플랫폼 프록시) 한 단계 뒤에 있으므로 그 X-Forwarded-*만 믿어야 req.secure·쿠키가 맞다.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api', { exclude: ['__health'] });
  // 모든 오류 응답을 api.md 1절 형식으로 맞추고 스택이 본문에 나가지 않게 한다.
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}

// 컨테이너 안에서는 0.0.0.0:3000에 붙어야 compose의 다른 서비스(nginx)가 접근할 수 있다.
// 운영 기동은 ServerModule로 DATABASE_URL에 연결하고 시드 사용자를 보장한다.
async function bootstrap(): Promise<void> {
  const app = await createApp(ServerModule);
  await app.listen(3000, '0.0.0.0');
}

if (require.main === module) {
  void bootstrap();
}
