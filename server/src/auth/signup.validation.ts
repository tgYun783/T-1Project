import { BadRequestException } from '@nestjs/common';

export const MIN_PASSWORD_LENGTH = 8;
// 공백·@ 없는 local@domain.tld 형태만 받는다. 엄밀한 RFC 검사보다 화면 오류 안내가 목적이다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupInput {
  email: string;
  password: string;
}

interface FieldError {
  field: 'email' | 'password';
  reason: string;
}

// 틀린 칸을 모두 모아 한 번에 돌려준다: 화면이 각 칸에 오류를 동시에 띄울 수 있다(api.md 1절 details).
export function parseSignupBody(body: unknown): SignupInput {
  const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const details: FieldError[] = [];

  const email = typeof obj.email === 'string' ? obj.email.trim().toLowerCase() : undefined;
  if (email === undefined) {
    details.push({ field: 'email', reason: '이메일을 입력해 주세요.' });
  } else if (!EMAIL_PATTERN.test(email)) {
    details.push({ field: 'email', reason: '이메일 형식이 아닙니다.' });
  }

  const password = typeof obj.password === 'string' ? obj.password : undefined;
  if (password === undefined) {
    details.push({ field: 'password', reason: '비밀번호를 입력해 주세요.' });
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    details.push({ field: 'password', reason: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` });
  }

  if (details.length > 0 || email === undefined || password === undefined) {
    throw new BadRequestException({ message: '입력값을 확인해 주세요.', details });
  }
  return { email, password };
}

// 로그인은 형식(문자열 여부)만 본다: 8자 규칙을 걸면 짧은 시드 비밀번호로 로그인이 막힌다.
export function parseLoginBody(body: unknown): SignupInput {
  const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const details: FieldError[] = [];

  const email = typeof obj.email === 'string' ? obj.email.trim().toLowerCase() : undefined;
  if (!email) {
    details.push({ field: 'email', reason: '이메일을 입력해 주세요.' });
  }
  const password = typeof obj.password === 'string' ? obj.password : undefined;
  if (!password) {
    details.push({ field: 'password', reason: '비밀번호를 입력해 주세요.' });
  }

  if (!email || !password) {
    throw new BadRequestException({ message: '입력값을 확인해 주세요.', details });
  }
  return { email, password };
}
