import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminInvenPipelineService } from './admin-inven-pipeline.service';

@Injectable()
export class AdminInvenCronService {
  private readonly logger = new Logger(AdminInvenCronService.name);

  constructor(private readonly pipeline: AdminInvenPipelineService) {}

  /**
   * 2시간마다 증분 실행 — 마지막 크롤 이후의 새 글만 수집(부하 분산).
   * targetDate 없이 run() → 파이프라인이 게시판별 최신 post_id 기준 증분 모드로 동작.
   */
  @Cron('0 */2 * * *', { timeZone: 'Asia/Seoul' })
  runScheduledPipeline() {
    this.logger.log('인벤 증분 파이프라인 시작');
    const result = this.pipeline.run();
    if (!result.started) {
      this.logger.warn(`파이프라인 건너뜀: ${result.reason}`);
    }
  }
}
