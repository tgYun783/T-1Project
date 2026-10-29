import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService, PublicUser, toPublicUser } from './auth.service';
import { parseSignupBody } from './signup.validation';

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
}
