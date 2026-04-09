import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { DbModule } from '../db/db.module';
import { KakaoModule } from '../kakao/kakao.module';

@Module({
  imports: [DbModule, KakaoModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
