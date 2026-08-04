import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis as RedisClient } from 'ioredis';
import { runIfLockAcquired } from '../common/cron-lock.util';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ChzzkClient, type ChzzkLiveItem } from './chzzk.client';
import { YoutubeApiService } from './youtube-api.service';
import {
  toYoutubeApiError,
  secondsUntilQuotaReset,
} from './youtube-quota.util';

const YOUTUBE_LIVE_CACHE_KEY = 'live:youtube:current';
// 갱신 크론이 20분마다 도므로 그보다 길게 잡는다(20분 + 5분 여유). 예전엔 12분(구 10분
// 크론 기준)이라 크론 사이 8분간 캐시가 비어, 그 구간의 모든 요청이 직접 API를 호출했다.
const YOUTUBE_LIVE_CACHE_TTL = 1500; // 25분
const LOCK_LIVES_KEY = 'youtube:lock:lives';
const LOCK_TTL = 60; // 락 최대 60초 유지 (영상 검색 경로와 동일 패턴)
// 참고: 라이브 폴링당 쿼터 ≈ search.list(100) + videos.list(1) = 101 units

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** YouTube 실시간 라이브 조회 + 캐시 갱신 (키 할당량 초과 시 다음 키로 회전) */
@Injectable()
export class YoutubeLiveService {
  private readonly logger = new Logger(YoutubeLiveService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly youtubeApi: YoutubeApiService,
    // filterByViewerCount는 플랫폼 무관 범용 필터라 Chzzk 전용 크라이언트에만 있어도
    // YouTube 라이브(ChzzkLiveItem[] 재사용)에도 그대로 쓸 수 있다.
    private readonly chzzk: ChzzkClient,
  ) {}

  /** YouTube 라이브 조회 및 캐시 저장 (키 할당량 초과 시 다음 키로 회전) */
  private async updateYoutubeLives(): Promise<void> {
    // 쿼터 단축: 모든 키 소진이 기록돼 있으면 직전 캐시 유지
    const quotaExceeded = await this.redis.get('youtube:quota_exceeded');
    if (quotaExceeded) {
      this.logger.warn('YouTube 라이브: 쿼터 초과 → 직전 캐시 유지');
      return;
    }

    // 검색 경로(youtube-videos.service)와 동일하게, 키 할당량 초과 시 다음 키로 전환하며 재시도.
    const total = this.youtubeApi.keyCount;
    for (let attempt = 0; attempt < total; attempt++) {
      try {
        await this._fetchAndCacheYoutubeLives();
        return;
      } catch (error: unknown) {
        const reason =
          toYoutubeApiError(error).response?.data?.error?.errors?.[0]?.reason;
        const isQuota =
          reason === 'quotaExceeded' ||
          reason === 'dailyLimitExceeded' ||
          /quota/i.test(toErrorMessage(error));

        if (isQuota && attempt < total - 1) {
          const newIdx = this.youtubeApi.rotateKey();
          this.logger.warn(
            `YouTube 라이브 키 ${attempt + 1}/${total} 할당량 초과 — 키 ${newIdx + 1}로 전환`,
          );
          continue;
        }

        if (isQuota) {
          // 모든 키 소진: 리셋까지 단축 플래그를 세워 불필요한 재호출(2.5s) 방지
          const ttl = secondsUntilQuotaReset();
          await this.redis
            .set('youtube:quota_exceeded', '1', 'EX', ttl)
            .catch(() => {});
          this.logger.warn(
            `YouTube 라이브: 모든 키(${total}) 할당량 초과 (${ttl}초 후 리셋)`,
          );
        } else {
          this.logger.error(
            `YouTube 라이브 갱신 실패: ${toErrorMessage(error)}`,
          );
        }
        return;
      }
    }
  }

  /** 현재 키로 라이브 1회 조회 + 캐시 저장. API 실패는 throw → 호출자가 키 회전 판단 */
  private async _fetchAndCacheYoutubeLives(): Promise<void> {
    // 1. search.list: 로스트아크 라이브 검색
    const searchRes = await this.youtubeApi.current.search.list({
      part: ['snippet'],
      q: '로스트아크',
      type: ['video'],
      eventType: 'live',
      order: 'viewCount',
      maxResults: 20,
    });

    const videoIds: string[] = [];
    for (const item of searchRes.data.items || []) {
      if (item.id?.videoId) {
        videoIds.push(item.id.videoId);
      }
    }

    if (videoIds.length === 0) {
      this.logger.debug('YouTube 라이브: 검색 결과 0개');
      return;
    }

    // 2. videos.list: 상세정보(시청자수, 시작시간)
    const videosRes = await this.youtubeApi.current.videos.list({
      part: ['snippet', 'liveStreamingDetails'],
      id: videoIds,
    });

    // 3. LiveEntry 매핑
    const lives: ChzzkLiveItem[] = [];
    for (const video of videosRes.data.items || []) {
      if (!video.snippet || !video.liveStreamingDetails || !video.id) continue;

      const concurrentViewers = Number(
        video.liveStreamingDetails.concurrentViewers ?? 0,
      );
      if (concurrentViewers < 0) continue; // 라이브 종료 케이스

      lives.push({
        platform: 'youtube',
        channelName: video.snippet.channelTitle || '',
        channelId: video.snippet.channelId || '',
        title: video.snippet.title || '',
        viewerCount: concurrentViewers,
        thumbnailUrl: video.snippet.thumbnails?.medium?.url || '',
        liveUrl: `https://www.youtube.com/watch?v=${video.id}`,
        startedAt: video.liveStreamingDetails.actualStartTime
          ? new Date(video.liveStreamingDetails.actualStartTime)
          : new Date(),
      });
    }

    if (lives.length === 0) {
      this.logger.debug('YouTube 라이브: 필터링 후 0개');
      return;
    }

    const serialized = JSON.stringify(lives);
    await this.redis.setex(
      YOUTUBE_LIVE_CACHE_KEY,
      YOUTUBE_LIVE_CACHE_TTL,
      serialized,
    );
    this.logger.log(
      `YouTube 라이브 캐시 저장: ${lives.length}개 (TTL ${YOUTUBE_LIVE_CACHE_TTL}초)`,
    );
  }

  /** YouTube 라이브 조회 (캐시 우선, 없으면 락으로 직렬화 후 직접 API 호출) */
  async getYoutubeLives(minViewers = 0): Promise<ChzzkLiveItem[]> {
    try {
      // 1. 캐시 확인
      const cached = await this.redis.get(YOUTUBE_LIVE_CACHE_KEY);
      if (cached) {
        const lives = JSON.parse(cached) as ChzzkLiveItem[];
        const filtered = this.chzzk.filterByViewerCount(lives, minViewers);
        this.logger.debug(
          `YouTube 캐시 hit: ${lives.length}개 → 필터링 후 ${filtered.length}개 (최소시청자 ${minViewers})`,
        );
        return filtered;
      }

      // 2. 캐시 없으면 분산 락 — 동시 요청 중 첫 번째만 API 호출(Thundering Herd 방지,
      //    검색 경로의 youtube:lock:videos 와 동일 패턴). 락을 못 잡으면 빈 결과.
      const lock = await this.redis
        .set(LOCK_LIVES_KEY, '1', 'EX', LOCK_TTL, 'NX')
        .catch(() => null);
      if (!lock) {
        this.logger.debug('YouTube 라이브 락 대기 중 — 빈 결과 반환');
        return [];
      }

      this.logger.debug('YouTube 캐시 미스 → 직접 API 호출');
      try {
        await this.updateYoutubeLives();
      } finally {
        await this.redis.del(LOCK_LIVES_KEY).catch(() => {});
      }

      // 다시 캐시 확인
      const cached2 = await this.redis.get(YOUTUBE_LIVE_CACHE_KEY);
      if (cached2) {
        const lives = JSON.parse(cached2) as ChzzkLiveItem[];
        const filtered = this.chzzk.filterByViewerCount(lives, minViewers);
        this.logger.debug(
          `YouTube 직접 호출 후: ${lives.length}개 → 필터링 후 ${filtered.length}개`,
        );
        return filtered;
      }

      return [];
    } catch (error: unknown) {
      this.logger.debug(`YouTube 라이브 조회 실패: ${toErrorMessage(error)}`);
      return [];
    }
  }

  /** 20분마다 YouTube 라이브 갱신 (워커0만, 로컬: 2시간마다)
   *  search.list=100유닛/회 → 20분(72회/일)=7,200유닛/일. 단일 프로젝트 10,000 한도 내,
   *  키 회전(updateYoutubeLives)과 합쳐 쿼터 소진 방지. */
  @Cron('0 */20 * * * *') // 운영: 20분 / 로컬: 2시간 (02:xx, 04:xx 등)
  async refreshYoutubeLives(): Promise<void> {
    // 20분 주기라 기본 TTL(60초)로 충분 — 다음 틱 전까지 여유 있게 풀림.
    await runIfLockAcquired(this.redis, 'refreshYoutubeLives', () =>
      this.refreshYoutubeLivesJob(),
    );
  }

  private async refreshYoutubeLivesJob(): Promise<void> {
    // 로컬 환경: 2시간마다만 실행 (매 2시간 정각: 00:xx, 02:xx, 04:xx, ...)
    if (process.env.NODE_ENV === 'development') {
      const now = new Date();
      if (now.getMinutes() !== 0 || now.getHours() % 2 !== 0) {
        return;
      }
    }

    await this.updateYoutubeLives();
  }
}
