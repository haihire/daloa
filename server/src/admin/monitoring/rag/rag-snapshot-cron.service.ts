import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { runIfLockAcquired } from '../../../common/cron-lock.util';
import { RagWriterService } from './rag-writer.service';

@Injectable()
export class RagSnapshotCronService {
  private readonly logger = new Logger(RagSnapshotCronService.name);

  constructor(
    private readonly writer: RagWriterService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * 매주 월요일 04:00(KST, 트래픽 한산한 새벽)에 운영 스냅샷 문서를 생성한다.
   *
   * generateWeeklySnapshot()이 같은 기간 문서가 있으면 스스로 건너뛰므로(force=false),
   * 이 크론이 겹쳐 돌아도 중복 문서가 쌓이지는 않는다. 여기 락은 그 확인·생성 자체가
   * 여러 PM2 워커에서 같은 틱에 동시에 도는 것만 막는 짧은 안전장치일 뿐이다
   * (runIfLockAcquired 자체가 이런 용도 — cron-lock.util.ts 참고).
   */
  @Cron('0 4 * * 1', { timeZone: 'Asia/Seoul' })
  async runWeeklySnapshot() {
    await runIfLockAcquired(this.redis, 'ragWeeklySnapshot', async () => {
      this.logger.log('주간 운영 스냅샷 생성 시작');
      try {
        const result = await this.writer.generateWeeklySnapshot();
        if (result.created) {
          this.logger.log(
            `스냅샷 생성 완료: ${result.title} (청크 ${result.chunks}개)`,
          );
        } else {
          this.logger.log(`스냅샷 건너뜀: ${result.reason}`);
        }
      } catch (e) {
        this.logger.error(
          `주간 스냅샷 생성 실패: ${e instanceof Error ? e.message : e}`,
        );
      }
    });
  }
}
