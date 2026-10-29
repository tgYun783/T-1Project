import { BadRequestException } from '@nestjs/common';
import { asObject } from '../auth/signup.validation';

// 답하기 본문 { text }(api.md 5절). 공백만 있는 답은 AI 비용만 쓰고 기록할 내용이 없으므로 빈 값과 같이 400.
export function validateAnswer(body: unknown): string {
  const text = asObject(body).text;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') {
    throw new BadRequestException({
      code: 'VALIDATION',
      message: '입력값을 확인해 주세요.',
      details: [{ field: 'text', reason: '답을 입력해 주세요.' }],
    });
  }
  return trimmed;
}
