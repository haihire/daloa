import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { KakaoService } from '../kakao/kakao.service';

/**
 * 전역 예외 필터
 * - HTTP 500 이상(서버 에러)은 카카오 알림 전송
 * - 4xx 클라이언트 에러는 알림 없이 정상 응답
 * - 1분 내 동일 에러 반복 시 카카오 스팸 방지
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // 마지막 알림 시각 (ms) - 1분 이내 중복 알림 방지
  private lastNotifiedAt = 0;
  private readonly NOTIFY_COOLDOWN_MS = 60_000;

  constructor(private readonly kakao: KakaoService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : String(exception);

    this.logger.error(
      `[${request.method}] ${request.url} → ${status}: ${message}`,
    );

    // 서버 에러(5xx)만 카카오 알림 전송
    if (status >= 500) {
      const now = Date.now();
      if (now - this.lastNotifiedAt > this.NOTIFY_COOLDOWN_MS) {
        this.lastNotifiedAt = now;
        this.kakao
          .send(
            `🚨 [서버 에러 발생]\n` +
              `경로: ${request.method} ${request.url}\n` +
              `상태: ${status}\n` +
              `메시지: ${message}`,
          )
          .catch((err: unknown) =>
            this.logger.warn(`카카오 알림 전송 실패: ${toErrorMessage(err)}`),
          );
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
