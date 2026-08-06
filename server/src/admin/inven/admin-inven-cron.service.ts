import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { cronJitter, CRON_JITTER_HEAVY_SEC } from '../../common/cron-lock.util';
import { AdminInvenPipelineService } from './admin-inven-pipeline.service';

@Injectable()
export class AdminInvenCronService {
  private readonly logger = new Logger(AdminInvenCronService.name);

  constructor(private readonly pipeline: AdminInvenPipelineService) {}

  /**
   * 새벽 02~05시 정각 4회 증분 실행 (KST).
   * targetDate 없이 run() → 파이프라인이 게시판별 최신 post_id 기준 증분 모드로 동작.
   *
   * 낮에 안 도는 이유: 이 파이프라인이 크론 중 가장 무겁다(크롤 + 수백 건 upsert).
   * 사용자가 없는 시간대로 몰아 낮 시간 응답 속도를 지킨다.
   *
   * ⚠️ 실행 횟수를 줄이면 1회당 처리량이 그만큼 늘어난다. 본문 fetch 캡
   *    (INVEN_MAX_DETAIL)을 넘긴 글은 content=null 로 영구히 남으므로,
   *    "캡 × 하루 실행 횟수 >= 하루 신규 글 수"를 깨지 않도록 같이 조정해야 한다.
   *    현재: 1,200 × 4 = 4,800건/일 vs 실측 신규 글 1,200~3,800건/일.
   *
   * 중복 실행 방지 락은 pipeline.run() 내부(Redis, 'invenPipeline' 키)에서 처리한다.
   * 이 락은 관리자의 수동 "지금 실행" 버튼과도 공유되므로, 크론에서 별도로
   * 감쌀 필요가 없다 — 여기서 또 감싸면 같은 키를 두 번 획득 시도하는 것일 뿐이다.
   */
  @Cron('0 2-5 * * *', { timeZone: 'Asia/Seoul' })
  async runScheduledPipeline() {
    // 이 크론이 가장 무겁다(크롤 + 수백 건 upsert). 짝수시 정각에 다른 크론들과 겹치면
    // nest CPU 가 통째로 튀므로 몇 분 흩어서 시작한다.
    // pipeline.run() 내부 락이 중복 실행을 막으므로 지터가 락 타이밍을 깨지 않는다.
    await cronJitter(CRON_JITTER_HEAVY_SEC);

    this.logger.log('인벤 증분 파이프라인 시작');
    const result = await this.pipeline.run();
    if (!result.started) {
      this.logger.warn(`파이프라인 건너뜀: ${result.reason}`);
    }
  }
}
