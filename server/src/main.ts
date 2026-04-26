import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { FileLoggerService } from './common/file-logger.service';
import { KakaoService } from './kakao/kakao.service';

async function bootstrap() {
  const logger = new FileLoggerService();
  const app = await NestFactory.create(AppModule, { logger });

  // Next.js SSR 서버(localhost:3000)에서의 요청 허용
  const rawOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
  const allowedOrigins = rawOrigin.split(',').map((o) => o.trim());
  // www 서브도메인 자동 추가 (예: https://daloa.kr → https://www.daloa.kr 도 허용)
  const wwwVariants = allowedOrigins
    .filter((o) => !o.includes('://www.'))
    .map((o) => o.replace('://', '://www.'));
  const origins = [...new Set([...allowedOrigins, ...wwwVariants])];

  app.enableCors({
    origin: origins,
  });

  // 전역 에러 필터 - 500 이상 에러 발생 시 카카오 알림
  const kakaoService = app.get(KakaoService);
  app.useGlobalFilters(new AllExceptionsFilter(kakaoService));

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
