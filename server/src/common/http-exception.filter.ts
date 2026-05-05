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
 * - 모든 에러(4xx, 5xx)에 대해 카카오 알림 전송
 * - 5xx: 쿨다운 1분, 4xx: 쿨다운 5분 (스팸 방지)
 * - 401/404는 빈번하므로 알림 제외
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // 상태코드별 마지막 알림 시각 (스팸 방지)
  private readonly lastNotifiedAt = new Map<number, number>();
  private readonly COOLDOWN_5XX_MS = 60_000;   // 5xx: 1분
  private readonly COOLDOWN_4XX_MS = 300_000;  // 4xx: 5분

  // 알림 제외 상태코드 (빈번하거나 의미 없는 에러)
  private readonly SKIP_STATUSES = new Set([401, 404]);

  constructor(private readonly kakao: KakaoService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorName =
      exception instanceof Error
        ? exception.constructor.name
        : 'UnknownError';

    const message =
      exception instanceof HttpException
        ? exception.message
        : String(exception);

    this.logger.error(
      `[${request.method}] ${request.url} → ${status} ${errorName}: ${message}`,
    );

    // 알림 전송 (401, 404 제외)
    if (!this.SKIP_STATUSES.has(status)) {
      const now = Date.now();
      const cooldown = status >= 500 ? this.COOLDOWN_5XX_MS : this.COOLDOWN_4XX_MS;
      const lastAt = this.lastNotifiedAt.get(status) ?? 0;

      if (now - lastAt > cooldown) {
        this.lastNotifiedAt.set(status, now);
        const emoji = status >= 500 ? '🚨' : '⚠️';
        this.kakao
          .send(
            `${emoji} [${status} ${errorName}]\n` +
              `경로: ${request.method} ${request.url}\n` +
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
