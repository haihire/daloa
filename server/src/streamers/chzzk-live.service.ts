import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis as RedisClient } from 'ioredis';
import { runIfLockAcquired } from '../common/cron-lock.util';
import { REDIS_CLIENT } from '../redis/redis.module';
import { StreamingRedisService } from './streaming-redis.service';
import { ChzzkClient, type ChzzkLiveItem } from './chzzk.client';

const CHZZK_LIVE_CACHE_KEY = 'live:chzzk:current';
const CHZZK_LIVE_CACHE_TTL = 90; // 90초 (크론 1분 + 1.5배 grace)

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Chzzk 실시간 라이브 조회 + 캐시 갱신 */
@Injectable()
export class ChzzkLiveService {
  private readonly logger = new Logger(ChzzkLiveService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly streamingRedis: StreamingRedisService,
    private readonly chzzk: ChzzkClient,
  ) {}

  /** Chzzk 라이브 조회 및 캐시 저장 */
  private async updateChzzkLives(): Promise<void> {
    try {
      const lives = await this.chzzk.fetchLivesByCategory();
      if (lives.length === 0) {
        this.logger.warn(`Chzzk 라이브 갱신: 로아 라이브 0개 (캐시 미갱신)`);
        return;
      }
      const serialized = JSON.stringify(lives);
      await this.streamingRedis.client.setex(
        CHZZK_LIVE_CACHE_KEY,
        CHZZK_LIVE_CACHE_TTL,
        serialized,
      );
      this.logger.log(
        `Chzzk 라이브 캐시 저장: ${lives.length}개 (TTL ${CHZZK_LIVE_CACHE_TTL}초)`,
      );
    } catch (error: unknown) {
      this.logger.error(`Chzzk 라이브 갱신 실패: ${toErrorMessage(error)}`);
    }
  }

  /** Chzzk 라이브 조회 (캐시 우선, 없으면 직접 API 호출 후 캐시에 채워둠) */
  async getChzzkLives(minViewers = 0): Promise<ChzzkLiveItem[]> {
    try {
      // 1. 캐시 확인
      const cached = await this.streamingRedis.client.get(CHZZK_LIVE_CACHE_KEY);
      if (cached) {
        const lives = JSON.parse(cached) as ChzzkLiveItem[];
        const filtered = this.chzzk.filterByViewerCount(lives, minViewers);
        this.logger.debug(
          `Chzzk 캐시 hit: ${lives.length}개 → 필터링 후 ${filtered.length}개 (최소시청자 ${minViewers})`,
        );
        return filtered;
      }

      // 2. 읽기 전용(로컬)이면 여기서 끝 — 개발 PC 에서 Chzzk API 를 긁지 않는다.
      //    운영 크론이 90초 TTL 로 계속 채우므로 잠깐 미스면 다음 요청에 다시 붙는다.
      if (this.streamingRedis.readOnly) {
        this.logger.debug(
          'YOUTUBE_REDIS_READONLY 활성화 — Chzzk 캐시 미스 시 빈 결과 반환',
        );
        return [];
      }

      // 3. 캐시 없으면 직접 API 호출. 크론(1분)이 죽어 있으면 이 경로가 계속 타므로
      //    조회 결과를 캐시에도 써서, 크론이 복구될 때까지 매 요청마다 25페이지를
      //    다시 스캔하지 않게 한다(updateChzzkLives와 동일하게 채운다).
      this.logger.debug('Chzzk 캐시 미스 → 직접 API 호출');
      const lives = await this.chzzk.fetchLivesByCategory();
      if (lives.length > 0) {
        await this.streamingRedis.client
          .setex(
            CHZZK_LIVE_CACHE_KEY,
            CHZZK_LIVE_CACHE_TTL,
            JSON.stringify(lives),
          )
          .catch(() => {});
      }
      const filtered = this.chzzk.filterByViewerCount(lives, minViewers);
      this.logger.debug(
        `Chzzk 직접 호출: ${lives.length}개 → 필터링 후 ${filtered.length}개`,
      );
      return filtered;
    } catch (error: unknown) {
      this.logger.debug(`Chzzk 조회 실패: ${toErrorMessage(error)}`);
      return [];
    }
  }

  /** 1분마다 Chzzk 라이브 갱신 (워커0만) */
  @Cron('0 */1 * * * *')
  async refreshChzzkLives(): Promise<void> {
    // 읽기 전용(로컬)이면 운영이 채워둔 캐시를 읽기만 한다. 안 그러면 개발 PC 가 매분
    // Chzzk API 를 20여 페이지씩 긁어 불필요한 외부 트래픽이 계속 나간다.
    if (this.streamingRedis.readOnly) {
      this.logger.debug(
        'YOUTUBE_REDIS_READONLY 활성화 — 스케줄 Chzzk 갱신 스킵',
      );
      return;
    }
    // 1분 주기라 TTL 10초 — 다음 틱(1분 후) 전까지 여유 있게 풀리게.
    await runIfLockAcquired(
      this.redis,
      'refreshChzzkLives',
      () => this.updateChzzkLives(),
      10,
    );
  }
}
