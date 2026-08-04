import { Module } from '@nestjs/common';
import { AdminInvenController } from './admin-inven.controller';
import { AdminInvenRepository } from './admin-inven.repository';
import { AdminInvenPipelineService } from './admin-inven-pipeline.service';
import { AdminInvenCronService } from './admin-inven-cron.service';
import { SiteExtractorService } from './site-extractor.service';
import { SiteSuggestService } from './site-suggest.service';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { SitesModule } from '../../sites/sites.module';

@Module({
  imports: [AdminAuthModule, SitesModule],
  controllers: [AdminInvenController],
  providers: [
    AdminInvenRepository,
    AdminInvenPipelineService,
    AdminInvenCronService,
    SiteExtractorService,
    SiteSuggestService,
  ],
  // 사이트 관리(admin/sites)도 같은 추천/메타 조회를 쓴다 — 후보 id 대신 URL로 호출.
  exports: [SiteSuggestService],
})
export class AdminInvenModule {}
