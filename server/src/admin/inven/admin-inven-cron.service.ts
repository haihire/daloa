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
   *
   * 중복 실행 방지 락은 pipeline.run() 내부(Redis, 'invenPipeline' 키)에서 처리한다.
   * 이 락은 관리자의 수동 "지금 실행" 버튼과도 공유되므로, 크론에서 별도로
   * 감쌀 필요가 없다 — 여기서 또 감싸면 같은 키를 두 번 획득 시도하는 것일 뿐이다.
   */
  @Cron('0 */2 * * *', { timeZone: 'Asia/Seoul' })
  async runScheduledPipeline() {
    this.logger.log('인벤 증분 파이프라인 시작');
    const result = await this.pipeline.run();
    if (!result.started) {
      this.logger.warn(`파이프라인 건너뜀: ${result.reason}`);
    }
  }
}
