import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService, PublicUser, toPublicUser } from './auth.service';
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
}
