// ⚠️ Sentry 초기화는 반드시 다른 import보다 먼저 실행돼야 함 (자동 계측 위해)
import './instrument';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { FileLoggerService } from './common/file-logger.service';
import { KakaoService } from './kakao/kakao.service';
import { AdminMonitoringService } from './admin/monitoring/admin-monitoring.service';

async function bootstrap() {
  const logger = new FileLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger,
    bodyParser: false,
  });
  const bodyLimit = process.env.BODY_LIMIT ?? '50mb';

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // Next.js SSR 서버(localhost:3000)에서의 요청 허용
  const rawOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
  const allowedOrigins = rawOrigin.split(',').map((o) => o.trim());
  // www 서브도메인 자동 추가 (예: https://lomoa.kr → https://www.lomoa.kr 도 허용)
  const wwwVariants = allowedOrigins
    .filter((o) => !o.includes('://www.'))
    .map((o) => o.replace('://', '://www.'));
  const origins = [...new Set([...allowedOrigins, ...wwwVariants])];

  app.enableCors({
    origin: origins,
  });

  // 전역 에러 필터 - 500 이상 에러 발생 시 카카오 알림 + 에러 로그 DB 기록
  const kakaoService = app.get(KakaoService);
  const monitoring = app.get(AdminMonitoringService);
  app.useGlobalFilters(new AllExceptionsFilter(kakaoService, monitoring));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ended = process.hrtime.bigint();
      void monitoring
        .recordRequest({
          scope: 'route',
          name: req.path,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Number(ended - started) / 1_000_000,
        })
        .catch(() => undefined);
    });
    next();
  });

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
