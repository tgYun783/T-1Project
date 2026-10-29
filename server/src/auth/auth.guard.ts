import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { UserDocument } from '../users/user.schema';
import { AuthService } from './auth.service';

// 가드가 찾은 사용자를 핸들러에 넘기는 자리(@CurrentUser()가 꺼낸다).
export interface AuthenticatedRequest extends Request {
  user?: UserDocument;
}

// 보호 경로 공통 관문: 세션이 없거나 세션의 사용자가 삭제됐으면 401 UNAUTHENTICATED(명세 02 결정).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.session?.userId;
    const user = userId ? await this.authService.findById(userId) : null;
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' });
    }
    req.user = user;
    return true;
  }
}
