import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis as RedisClient } from 'ioredis';
import {
  runIfLockAcquired,
  CRON_JITTER_HEAVY_SEC,
} from '../common/cron-lock.util';
import { REDIS_CLIENT } from '../redis/redis.module';
import { StreamingRedisService } from './streaming-redis.service';
import { YoutubeApiService } from './youtube-api.service';
import {
  toYoutubeApiError,
  secondsUntilQuotaReset,
} from './youtube-quota.util';

const CACHE_PREFIX = 'youtube:videos:page:';
const CACHE_TTL = 4 * 60 * 60; // 4시간 (Cron 3시간 갱신 + 여유)
const QUOTA_KEY = 'youtube:quota_exceeded';
const LOCK_VIDEOS_KEY = 'youtube:lock:videos';
const LOCK_TTL = 60; // 락 최대 60초 유지
const MAX_RESULTS = 20;

export interface YoutubeVideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
}

/** YouTube API 응답의 HTML 엔티티 디코딩 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseDurationSec(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] ?? '0') * 3600 +
    parseInt(m[2] ?? '0') * 60 +
    parseInt(m[3] ?? '0')
  );
}

function formatDuration(iso: string): string {
  const sec = parseDurationSec(iso);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** YouTube 동영상 검색 (Redis 캐시) */
@Injectable()
export class YoutubeVideosService implements OnModuleInit {
  private readonly logger = new Logger(YoutubeVideosService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly streamingRedis: StreamingRedisService,
    private readonly youtubeApi: YoutubeApiService,
  ) {}

  async onModuleInit() {
    // PM2 cluster: 워커0(또는 비클러스터=undefined)만 실행. 동시 YouTube API 호출 방지.
    const inst = process.env.NODE_APP_INSTANCE;
    if (inst !== undefined && inst !== '0') return;

    if (this.streamingRedis.readOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — 시작 시 YouTube 갱신 스킵',
      );
      return;
    }

    if (this.youtubeApi.quotaApisDisabled) {
      this.logger.log(
        'LOCAL_DISABLE_QUOTA_APIS 활성화 — 시작 시 YouTube 갱신 스킵',
      );
      return;
    }

    // Redis에 캐시가 이미 있으면 API 호출 스킵 (서버 재시작 보호)
    try {
      const cached = await this.redis.get(CACHE_PREFIX + 'first');
      if (cached) {
        this.logger.log('YouTube 캐시 존재 — 시작 시 API 호출 스킵');
        return;
      }
    } catch (error: unknown) {
      this.logger.debug(`Redis 확인 실패(무시): ${toErrorMessage(error)}`);
    }
    await this.refresh();
  }

  /** 3시간마다 갱신 */
  @Cron('0 */3 * * *')
  async refresh() {
    // PM2 cluster 워커 간 중복 실행 방지 — YouTube API quota를 이중 소모하지 않도록.
    await runIfLockAcquired(
      this.redis,
      'streamersRefresh',
      () => this.refreshJob(),
      300,
      CRON_JITTER_HEAVY_SEC,
    );
  }

  private async refreshJob() {
    if (this.streamingRedis.readOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — 스케줄 YouTube 갱신 스킵',
      );
      return;
    }

    if (this.youtubeApi.quotaApisDisabled) {
      this.logger.log(
        'LOCAL_DISABLE_QUOTA_APIS 활성화 — 스케줄 YouTube 갱신 스킵',
      );
      return;
    }

    // 할당량 초과 플래그 확인
    try {
      const blocked = await this.streamingRedis.client.get(QUOTA_KEY);
      if (blocked) {
        const ttl = await this.streamingRedis.client.ttl(QUOTA_KEY);
        this.logger.warn(
          `YouTube 할당량 초과 상태 — ${Math.ceil(ttl / 60)}분 후 리셋`,
        );
        return;
      }
    } catch (error: unknown) {
      this.logger.debug(
        `할당량 플래그 조회 실패(무시): ${toErrorMessage(error)}`,
      );
    }

    this.logger.log('YouTube 영상 목록 갱신 시작');
    try {
      const result = await this.fetchFromYouTube();
      await this.streamingRedis.client.set(
        CACHE_PREFIX + 'first',
        JSON.stringify(result),
        'EX',
        CACHE_TTL,
      );
      this.logger.log(`YouTube 영상 ${result.items.length}건 캐시 저장`);
    } catch (err: unknown) {
      const apiErr = toYoutubeApiError(err);
      const status = apiErr.response?.status;
      const reason = apiErr.response?.data?.error?.errors?.[0]?.reason;
      this.logger.error(
        `YouTube 갱신 실패 [HTTP ${status ?? 'unknown'}] reason: ${reason ?? 'unknown'}`,
        apiErr.response?.data?.error?.message ?? toErrorMessage(err),
      );

      // 할당량 초과 시 리셋 시각까지 플래그 설정
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        const ttl = secondsUntilQuotaReset();
        await this.streamingRedis.client
          .set(QUOTA_KEY, '1', 'EX', ttl)
          .catch(() => {});
        this.logger.warn(
          `YouTube 할당량 초과 — ${Math.ceil(ttl / 60)}분 후 자동 재개`,
        );
      }
    }
  }

  async searchVideos(pageToken?: string): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    const cacheKey = CACHE_PREFIX + (pageToken ?? 'first');

    // 1. Redis 캐시 확인
    try {
      const cached = await this.streamingRedis.client.get(cacheKey);
      if (cached)
        return JSON.parse(cached) as {
          items: YoutubeVideoItem[];
          nextPageToken: string | null;
        };
    } catch (err) {
      this.logger.warn('YouTube Redis get 실패', (err as Error).message);
    }

    if (this.streamingRedis.readOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — YouTube 캐시 미스 시 빈 결과 반환',
      );
      return { items: [], nextPageToken: null };
    }

    if (this.youtubeApi.quotaApisDisabled) {
      this.logger.log(
        'LOCAL_DISABLE_QUOTA_APIS 활성화 — YouTube API 호출 없이 빈 결과 반환',
      );
      return { items: [], nextPageToken: null };
    }

    // 2. 할당량 초과 상태면 빈 결과 반환
    try {
      const blocked = await this.streamingRedis.client.get(QUOTA_KEY);
      if (blocked) return { items: [], nextPageToken: null };
    } catch (error: unknown) {
      this.logger.debug(
        `할당량 플래그 조회 실패(무시): ${toErrorMessage(error)}`,
      );
    }

    // 3. 분산 락 — 동시 요청 중 첫 번째만 API 호출 (Thundering Herd 방지)
    const lockKey = `${LOCK_VIDEOS_KEY}:${pageToken ?? 'first'}`;
    const lock = await this.streamingRedis.client
      .set(lockKey, '1', 'EX', LOCK_TTL, 'NX')
      .catch(() => null);
    if (!lock) {
      this.logger.debug('YouTube videos 락 대기 중 — 빈 결과 반환');
      return { items: [], nextPageToken: null };
    }

    // 4. YouTube API 호출
    let result: { items: YoutubeVideoItem[]; nextPageToken: string | null };
    try {
      result = await this.fetchFromYouTube(pageToken);
    } catch (err: unknown) {
      this.logger.error(`getStreamers 실패: ${toErrorMessage(err)}`);
      await this.streamingRedis.client.del(lockKey).catch(() => {});
      return { items: [], nextPageToken: null };
    }

    try {
      await this.streamingRedis.client.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        CACHE_TTL,
      );
    } catch (err) {
      this.logger.warn('YouTube Redis set 실패', (err as Error).message);
    } finally {
      await this.streamingRedis.client.del(lockKey).catch(() => {});
    }

    return result;
  }

  private async fetchFromYouTube(
    pageToken?: string,
    order: 'date' | 'viewCount' = 'date',
    query = '로스트아크',
  ): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    const total = this.youtubeApi.keyCount;
    for (let attempt = 0; attempt < total; attempt++) {
      try {
        return await this._doFetch(pageToken, order, query);
      } catch (err: unknown) {
        const reason =
          toYoutubeApiError(err).response?.data?.error?.errors?.[0]?.reason;
        if (
          (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') &&
          attempt < total - 1
        ) {
          const newIdx = this.youtubeApi.rotateKey();
          this.logger.warn(
            `YouTube 키 ${attempt + 1}/${total} 할당량 초과 — 키 ${newIdx + 1}로 전환`,
          );
          continue;
        }
        throw err;
      }
    }
    throw new Error('모든 YouTube API 키 할당량 초과');
  }

  private async _doFetch(
    pageToken?: string,
    order: 'date' | 'viewCount' = 'date',
    query = '로스트아크',
  ): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    // 1. 동영상 검색 (최신순)
    const searchRes = await this.youtubeApi.current.search.list({
      part: ['id', 'snippet'],
      q: query,
      type: ['video'],
      order,
      relevanceLanguage: 'ko',
      regionCode: 'KR',
      maxResults: MAX_RESULTS,
      ...(pageToken ? { pageToken } : {}),
    });

    const nextPageToken = searchRes.data.nextPageToken ?? null;

    const videoIds = (searchRes.data.items ?? [])
      .map((i) => i.id?.videoId)
      .filter(Boolean) as string[];

    if (videoIds.length === 0) return { items: [], nextPageToken };

    // 2. 영상 상세 (재생시간 + 조회수) 조회
    const detailsRes = await this.youtubeApi.current.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds,
    });

    const items: YoutubeVideoItem[] = (detailsRes.data.items ?? [])
      .filter((v) => {
        const sec = parseDurationSec(v.contentDetails?.duration ?? '');
        const minSec = 300; // 5분 이상 (숏츠 제외)
        if (sec < minSec) return false;
        if (sec >= 3600) return false; // 1시간 이상 제외
        if (parseInt(v.statistics?.viewCount ?? '0', 10) < 1000) return false; // 조회수 1000 미만 제외
        // 로스트아크 무관 키워드가 제목/채널에 포함된 영상 제외
        const text =
          `${v.snippet?.title ?? ''} ${v.snippet?.channelTitle ?? ''}`.toLowerCase();
        const EXCLUDE = [
          '붉은사막',
          '블레이드앤소울',
          '검은사막',
          '와우',
          'world of warcraft',
        ];
        return !EXCLUDE.some((kw) => text.includes(kw));
      })
      .map((v) => ({
        videoId: v.id ?? '',
        title: decodeHtmlEntities(v.snippet?.title ?? ''),
        channelTitle: decodeHtmlEntities(v.snippet?.channelTitle ?? ''),
        thumbnailUrl:
          v.snippet?.thumbnails?.medium?.url ??
          v.snippet?.thumbnails?.default?.url ??
          '',
        publishedAt: v.snippet?.publishedAt ?? '',
        duration: formatDuration(v.contentDetails?.duration ?? ''),
        viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
      }));

    return { items, nextPageToken };
  }
}
