import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { UserDocument } from '../users/user.schema';
import { AuthGuard } from './auth.guard';
import { AuthService, PublicUser, toPublicUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { sessionCookieOptions } from './session';
import { parseLoginBody, parseSignupBody } from './signup.validation';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 가입 즉시 로그인(api.md 3절): 세션에 userId만 두어 쿠키를 발급한다.
  @Post('signup')
  @HttpCode(201)
  async signup(@Body() body: unknown, @Req() req: Request): Promise<{ user: PublicUser }> {
    const { email, password } = parseSignupBody(body);
    const doc = await this.authService.signup(email, password);
    req.session.userId = doc._id.toString();
    return { user: toPublicUser(doc) };
  }

  // 로그인 성공 시 세션 id를 새로 발급해 로그인 전 세션 id를 재사용하는 세션 고정 공격을 막는다.
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request): Promise<{ user: PublicUser }> {
    const { email, password } = parseLoginBody(body);
    const doc = await this.authService.login(email, password);
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err: unknown) =>
        err ? reject(err instanceof Error ? err : new Error('세션 재발급에 실패했습니다.')) : resolve(),
      ),
    );
    req.session.userId = doc._id.toString();
    return { user: toPublicUser(doc) };
  }

  // 프런트가 로그인 여부를 확인하는 경로: 세션이 없거나 사용자가 사라졌으면 401 UNAUTHENTICATED.
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: UserDocument): { user: PublicUser } {
    return { user: toPublicUser(user) };
  }

  // 서버 세션을 파기한 뒤 쿠키를 지운다: 쿠키만 지우면 훔친 sid로 계속 접근할 수 있다. 비로그인 호출도 204(멱등).
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err: unknown) =>
        err ? reject(err instanceof Error ? err : new Error('세션 파기에 실패했습니다.')) : resolve(),
      ),
    );
    res.clearCookie('sid', sessionCookieOptions());
  }
}
