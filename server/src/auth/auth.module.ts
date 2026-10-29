import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

// 인증은 users 모델과 세션이 필요하므로 Mongo가 붙는 ServerModule에서만 올린다.
// AuthGuard·AuthService를 내보내 이력서·자소서 등 다른 모듈의 보호 경로가 같은 가드를 쓴다.
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
