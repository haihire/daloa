import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { KakaoService } from './kakao/kakao.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Next.js SSR 서버(localhost:3000)에서의 요청 허용
  app.enableCors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
  });

  // 전역 에러 필터 - 500 이상 에러 발생 시 카카오 알림
  const kakaoService = app.get(KakaoService);
  app.useGlobalFilters(new AllExceptionsFilter(kakaoService));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
