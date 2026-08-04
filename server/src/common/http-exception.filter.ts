import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { KakaoService } from '../kakao/kakao.service';

/**
 * 에러를 DB에 남기는 기록기(선택). AdminMonitoringService가 구조적으로 이 형태를 만족한다.
 * common → admin 모듈을 직접 import하지 않으려고 최소 인터페이스만 둔다.
 */
export interface ErrorLogRecorder {
  recordError(input: {
    statusCode: number;
    errorName: string;
    method: string;
    path: string;
    message: string;
    stack: string | null;
  }): Promise<void>;
}

/**
 * 전역 예외 필터
 * - 모든 에러(4xx, 5xx)에 대해 카카오 알림 전송
 * - 5xx: 쿨다운 1분, 4xx: 쿨다운 5분 (스팸 방지)
 * - 401/404는 빈번하므로 알림 제외
 * - 401/404를 뺀 모든 에러를 DB(error_logs)에도 기록(관리자 UI 조회용, fire-and-forget)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // 상태코드별 마지막 알림 시각 (스팸 방지).
  // 프로세스 메모리에만 있어 PM2 cluster 워커별로 독립 — 워커 수만큼 알림이 더 나올 수 있다.
  private readonly lastNotifiedAt = new Map<number, number>();
  private readonly COOLDOWN_5XX_MS = 60_000; // 5xx: 1분
  private readonly COOLDOWN_4XX_MS = 300_000; // 4xx: 5분

  // 알림 제외 상태코드 (빈번하거나 의미 없는 에러)
  private readonly SKIP_STATUSES = new Set([401, 404]);

  constructor(
    private readonly kakao: KakaoService,
    private readonly recorder?: ErrorLogRecorder,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorName =
      exception instanceof Error ? exception.constructor.name : 'UnknownError';

    const message =
      exception instanceof HttpException
        ? exception.message
        : String(exception);

    this.logger.error(
      `[${request.method}] ${request.url} → ${status} ${errorName}: ${message}`,
    );

    // 예기치 못한 서버 에러(5xx)만 Sentry로 전송 (4xx 클라이언트 에러는 노이즈라 제외)
    if (status >= 500) {
      Sentry.captureException(exception);
    }

    // DB 기록 (401/404 제외). 스택은 원인 추적이 필요한 5xx만 저장.
    // fire-and-forget — 기록 실패가 요청 응답이나 다른 알림을 막지 않게 한다.
    if (this.recorder && !this.SKIP_STATUSES.has(status)) {
      const stack =
        status >= 500 && exception instanceof Error
          ? (exception.stack ?? null)
          : null;
      this.recorder
        .recordError({
          statusCode: status,
          errorName,
          method: request.method,
          path: request.url,
          message,
          stack,
        })
        .catch((err: unknown) =>
          this.logger.warn(`에러 로그 DB 기록 실패: ${toErrorMessage(err)}`),
        );
    }

    // 알림 전송 (401, 404 제외)
    if (!this.SKIP_STATUSES.has(status)) {
      const now = Date.now();
      const cooldown =
        status >= 500 ? this.COOLDOWN_5XX_MS : this.COOLDOWN_4XX_MS;
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
