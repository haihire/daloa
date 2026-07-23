import { Module } from '@nestjs/common';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminMonitoringService } from './admin-monitoring.service';
import { DockerStatsService } from './docker-stats.service';
import { AiDiagnosisService } from './ai-diagnosis.service';
import { MonitoringRepository } from './monitoring.repository';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminMonitoringController],
  providers: [
    AdminMonitoringService,
    DockerStatsService,
    AiDiagnosisService,
    MonitoringRepository,
  ],
  exports: [AdminMonitoringService],
})
export class AdminMonitoringModule {}
