import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.guard';

// 핸들러가 세션을 직접 뒤지지 않고 AuthGuard가 확인한 사용자만 받게 한다(소유자 검사의 기준값).
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
});
