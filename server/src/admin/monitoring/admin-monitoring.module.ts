import { Module } from '@nestjs/common';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminMonitoringService } from './admin-monitoring.service';
import { DockerStatsService } from './docker-stats.service';
import { AiDiagnosisService } from './ai-diagnosis.service';
import { MonitoringRepository } from './monitoring.repository';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { RagRepository } from './rag/rag.repository';
import { RagEmbeddingService } from './rag/rag-embedding.service';
import { RagWriterService } from './rag/rag-writer.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminMonitoringController],
  providers: [
    AdminMonitoringService,
    DockerStatsService,
    AiDiagnosisService,
    MonitoringRepository,
    RagRepository,
    RagEmbeddingService,
    RagWriterService,
  ],
  exports: [AdminMonitoringService],
})
export class AdminMonitoringModule {}
