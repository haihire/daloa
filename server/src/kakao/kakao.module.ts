import { Module, Global } from '@nestjs/common';
import { KakaoService } from './kakao.service';

@Global()
@Module({
  providers: [KakaoService],
  exports: [KakaoService],
})
export class KakaoModule {}
