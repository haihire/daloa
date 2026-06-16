import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSitesController } from './admin-sites.controller';
import { AdminCacheController } from './admin-cache.controller';
import { AdminCharactersController } from './admin-characters.controller';
import { AdminYoutubeController } from './admin-youtube.controller';
import { AdminGuard, AdminWriteGuard } from './admin.guard';
import { SitesModule } from '../sites/sites.module';
import { StreamersModule } from '../streamers/streamers.module';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminMonitoringService } from './admin-monitoring.service';
import { DockerStatsService } from './docker-stats.service';
import { AiDiagnosisService } from './ai-diagnosis.service';
import { MonitoringRepository } from './repositories/monitoring.repository';
import { AdminAuthRepository } from './repositories/admin-auth.repository';
import { AdminCharactersRepository } from './repositories/admin-characters.repository';
import { AdminInvenController } from './admin-inven.controller';
import { AdminInvenRepository } from './repositories/admin-inven.repository';
import { AdminInvenCronService } from './admin-inven-cron.service';
import { AdminInvenPipelineService } from './admin-inven-pipeline.service';
import { SiteExtractorService } from './site-extractor.service';
import { SiteSuggestService } from './site-suggest.service';

@Module({
  imports: [SitesModule, StreamersModule],
  controllers: [
    AdminAuthController,
    AdminSitesController,
    AdminCacheController,
    AdminCharactersController,
    AdminYoutubeController,
    AdminMonitoringController,
    AdminInvenController,
  ],
  providers: [
    AdminAuthService,
    AdminGuard,
    AdminWriteGuard,
    AdminMonitoringService,
    DockerStatsService,
    AiDiagnosisService,
    MonitoringRepository,
    AdminAuthRepository,
    AdminCharactersRepository,
    AdminInvenRepository,
    AdminInvenCronService,
    AdminInvenPipelineService,
    SiteExtractorService,
    SiteSuggestService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
