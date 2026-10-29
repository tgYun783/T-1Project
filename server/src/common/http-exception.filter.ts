import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AiUnavailableError } from '../ai/ai-unavailable.error';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// api.md 1절이 정한 상태→코드 매핑. 나머지 4xx는 HttpStatus 이름(CONFLICT 등)을 쓴다.
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
};

const INTERNAL_MESSAGE = '서버 오류가 발생했습니다.';

// 모든 예외를 { error: { code, message } }로 통일한다: 프런트가 code로 분기하고, 스택·내부 메시지는 본문에 싣지 않는다.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ErrorBody } {
    // AI 실패는 api.md 1절대로 502 AI_UNAVAILABLE. message는 고정 안내문이라 키·원문 응답이 없다.
    if (exception instanceof AiUnavailableError) {
      return {
        status: HttpStatus.BAD_GATEWAY,
        body: { error: { code: 'AI_UNAVAILABLE', message: exception.message } },
      };
    }

    if (!(exception instanceof HttpException)) {
      // 원인은 서버 로그에만 남긴다(본문에 넣으면 경로·비밀이 샌다).
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } },
      };
    }

    const status = exception.getStatus();
    const raw = exception.getResponse();
    const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

    // 도메인 코드(EMAIL_TAKEN·AI_UNAVAILABLE 등)를 던진 경우 그대로 살린다.
    const code =
      typeof obj.code === 'string'
        ? obj.code
        : (CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : (HttpStatus[status] ?? 'ERROR')));

    let message: string;
    if (status >= 500 && typeof obj.code !== 'string') {
      this.logger.error(exception.message, exception.stack);
      message = INTERNAL_MESSAGE;
    } else if (typeof raw === 'string') {
      message = raw;
    } else if (Array.isArray(obj.message)) {
      message = obj.message.map(String).join(', ');
    } else if (typeof obj.message === 'string') {
      message = obj.message;
    } else {
      message = exception.message;
    }

    const error: ErrorBody['error'] = { code, message };
    // details는 프런트가 칸·카드별로 표시해야 하는 코드만 살린다(NO_CONFIRMED_FACTS는 문제 카드 목록, api.md 7절 ②).
    if ((code === 'VALIDATION' || code === 'NO_CONFIRMED_FACTS') && Array.isArray(obj.details)) {
      error.details = obj.details;
    }
    return { status, body: { error } };
  }
}
