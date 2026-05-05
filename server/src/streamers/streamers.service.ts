import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { google } from 'googleapis';
import Redis, { type Redis as RedisClient } from 'ioredis';
import { isLocalQuotaApisDisabled } from '../common/local-dev-flags';
import { REDIS_CLIENT } from '../redis/redis.module';

const CACHE_PREFIX = 'youtube:videos:page:';
const POPULAR_CACHE_KEY = 'youtube:popular:first';
const CACHE_TTL = 4 * 60 * 60; // 4시간 (Cron 3시간 갱신 + 여유)
const QUOTA_KEY = 'youtube:quota_exceeded';
const LOCK_VIDEOS_KEY = 'youtube:lock:videos';
const LOCK_POPULAR_KEY = 'youtube:lock:popular';
const LOCK_TTL = 60; // 락 최대 60초 유지
const MAX_RESULTS = 20;
const POPULAR_MAX_RESULTS = 50;
const POPULAR_MAX_LIMIT = 50;
const POPULAR_MAX_PAGES = 8;

export interface PopularResponse {
  items: YoutubeVideoItem[];
  nextOffset: number | null;
  hasMore: boolean;
  total: number;
}

interface YoutubeApiErrorShape {
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
        errors?: Array<{
          reason?: string;
        }>;
      };
    };
  };
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

/** YouTube 할당량 리셋까지 남은 초 (매일 오후 4시 KST = 07:00 UTC) */
function secondsUntilQuotaReset(): number {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(7, 0, 0, 0);
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return Math.ceil((reset.getTime() - now.getTime()) / 1000);
}

export interface YoutubeVideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
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

function isTruthy(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

@Injectable()
export class StreamersService implements OnModuleInit {
  private readonly logger = new Logger(StreamersService.name);
  private readonly youtubeKeys: ReturnType<typeof google.youtube>[];
  private readonly quotaApisDisabled: boolean;
  private readonly youtubeRedis: RedisClient;
  private readonly youtubeRedisReadOnly: boolean;
  private currentKeyIdx = 0;

  private get youtube() {
    return this.youtubeKeys[this.currentKeyIdx];
  }

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly config: ConfigService,
  ) {
    const keys: string[] = [];
    const first = config.get<string>('YOUTUBE_API_KEY', '');
    if (first) keys.push(first);
    for (let i = 2; ; i++) {
      const k = config.get<string>(`YOUTUBE_API_KEY_${i}`, '');
      if (!k) break;
      keys.push(k);
    }
    this.youtubeKeys = keys.map((k) =>
      google.youtube({ version: 'v3', auth: k }),
    );
    this.quotaApisDisabled = isLocalQuotaApisDisabled(config);
    this.youtubeRedisReadOnly = isTruthy(
      config.get<string>('YOUTUBE_REDIS_READONLY'),
    );

    const youtubeRedisHost = config.get<string>('YOUTUBE_REDIS_HOST');
    if (youtubeRedisHost) {
      this.youtubeRedis = new Redis({
        host: youtubeRedisHost,
        port: config.get<number>('YOUTUBE_REDIS_PORT', 6379),
        password: config.get<string>('YOUTUBE_REDIS_PASSWORD') || undefined,
        db: config.get<number>('YOUTUBE_REDIS_DB', 0),
        lazyConnect: true,
      });
      this.logger.log(
        `YouTube 전용 Redis 사용 — ${youtubeRedisHost}:${config.get<number>('YOUTUBE_REDIS_PORT', 6379)}`,
      );
    } else {
      this.youtubeRedis = this.redis;
    }
  }

  async onModuleInit() {
    if (this.youtubeRedisReadOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — 시작 시 YouTube 갱신 스킵',
      );
      return;
    }

    if (this.quotaApisDisabled) {
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
    if (this.youtubeRedisReadOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — 스케줄 YouTube 갱신 스킵',
      );
      return;
    }

    if (this.quotaApisDisabled) {
      this.logger.log(
        'LOCAL_DISABLE_QUOTA_APIS 활성화 — 스케줄 YouTube 갱신 스킵',
      );
      return;
    }

    // 할당량 초과 플래그 확인
    try {
      const blocked = await this.youtubeRedis.get(QUOTA_KEY);
      if (blocked) {
        const ttl = await this.youtubeRedis.ttl(QUOTA_KEY);
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
      await this.youtubeRedis.set(
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
        await this.youtubeRedis.set(QUOTA_KEY, '1', 'EX', ttl).catch(() => {});
        this.logger.warn(
          `YouTube 할당량 초과 — ${Math.ceil(ttl / 60)}분 후 자동 재개`,
        );
      }
      return;
    }

    // popular 캐시도 함께 갱신 (캐시 미스 시 API 다중 호출 방지)
    this.logger.log('YouTube 인기 영상 목록 갱신 시작');
    try {
      const allItems: YoutubeVideoItem[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < POPULAR_MAX_PAGES; page++) {
        const result = await this.fetchFromYouTube(pageToken, 'date', true);
        allItems.push(...result.items);
        if (!result.nextPageToken) break;
        pageToken = result.nextPageToken;
      }
      allItems.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      await this.youtubeRedis.set(
        POPULAR_CACHE_KEY,
        JSON.stringify({ items: allItems }),
        'EX',
        CACHE_TTL,
      );
      this.logger.log(`YouTube 인기 영상 ${allItems.length}건 캐시 저장`);
    } catch (err: unknown) {
      const apiErr = toYoutubeApiError(err);
      const status = apiErr.response?.status;
      const reason = apiErr.response?.data?.error?.errors?.[0]?.reason;
      this.logger.error(
        `YouTube 인기 갱신 실패 [HTTP ${status ?? 'unknown'}] reason: ${reason ?? 'unknown'}`,
        apiErr.response?.data?.error?.message ?? toErrorMessage(err),
      );

      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        const ttl = secondsUntilQuotaReset();
        await this.youtubeRedis.set(QUOTA_KEY, '1', 'EX', ttl).catch(() => {});
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
      const cached = await this.youtubeRedis.get(cacheKey);
      if (cached)
        return JSON.parse(cached) as {
          items: YoutubeVideoItem[];
          nextPageToken: string | null;
        };
    } catch (err) {
      this.logger.warn('YouTube Redis get 실패', (err as Error).message);
    }

    if (this.youtubeRedisReadOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — YouTube 캐시 미스 시 빈 결과 반환',
      );
      return { items: [], nextPageToken: null };
    }

    if (this.quotaApisDisabled) {
      this.logger.log(
        'LOCAL_DISABLE_QUOTA_APIS 활성화 — YouTube API 호출 없이 빈 결과 반환',
      );
      return { items: [], nextPageToken: null };
    }

    // 2. 할당량 초과 상태면 빈 결과 반환
    try {
      const blocked = await this.youtubeRedis.get(QUOTA_KEY);
      if (blocked) return { items: [], nextPageToken: null };
    } catch (error: unknown) {
      this.logger.debug(
        `할당량 플래그 조회 실패(무시): ${toErrorMessage(error)}`,
      );
    }

    // 3. 분산 락 — 동시 요청 중 첫 번째만 API 호출 (Thundering Herd 방지)
    const lockKey = `${LOCK_VIDEOS_KEY}:${pageToken ?? 'first'}`;
    const lock = await this.youtubeRedis
      .set(lockKey, '1', 'NX', 'EX', LOCK_TTL)
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
      await this.youtubeRedis.del(lockKey).catch(() => {});
      return { items: [], nextPageToken: null };
    }

    try {
      await this.youtubeRedis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        CACHE_TTL,
      );
    } catch (err) {
      this.logger.warn('YouTube Redis set 실패', (err as Error).message);
    } finally {
      await this.youtubeRedis.del(lockKey).catch(() => {});
    }

    return result;
  }

  /**
   * GET /api/streamers/popular
   * offset/limit 미지정 시 전체 목록, 지정 시 캐시된 목록을 분할 반환
   */
  async searchPopularVideos(offset = 0, limit = 0): Promise<PopularResponse> {
    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.min(Math.max(0, limit), POPULAR_MAX_LIMIT);

    try {
      const cached = await this.youtubeRedis.get(POPULAR_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { items: YoutubeVideoItem[] };
        return this.slicePopular(parsed.items, safeOffset, safeLimit);
      }
    } catch (error: unknown) {
      this.logger.debug(
        `popular 캐시 조회 실패(무시): ${toErrorMessage(error)}`,
      );
    }

    if (this.youtubeRedisReadOnly) {
      this.logger.log(
        'YOUTUBE_REDIS_READONLY 활성화 — 인기 영상 캐시 미스 시 빈 결과 반환',
      );
      return { items: [], nextOffset: null, hasMore: false, total: 0 };
    }

    if (this.quotaApisDisabled) {
      this.logger.log(
        'LOCAL_DISABLE_QUOTA_APIS 활성화 — 인기 영상 API 호출 없이 빈 결과 반환',
      );
      return { items: [], nextOffset: null, hasMore: false, total: 0 };
    }

    try {
      const blocked = await this.youtubeRedis.get(QUOTA_KEY);
      if (blocked) {
        return { items: [], nextOffset: null, hasMore: false, total: 0 };
      }
    } catch (error: unknown) {
      this.logger.debug(
        `할당량 플래그 조회 실패(무시): ${toErrorMessage(error)}`,
      );
    }

    // 분산 락 — 동시 요청 중 첫 번째만 API 호출 (Thundering Herd 방지)
    const popularLock = await this.youtubeRedis
      .set(LOCK_POPULAR_KEY, '1', 'NX', 'EX', LOCK_TTL)
      .catch(() => null);
    if (!popularLock) {
      this.logger.debug('YouTube popular 락 대기 중 — 빈 결과 반환');
      return { items: [], nextOffset: null, hasMore: false, total: 0 };
    }

    let popular: { items: YoutubeVideoItem[] };
    try {
      const allItems: YoutubeVideoItem[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < POPULAR_MAX_PAGES; page++) {
        const result = await this.fetchFromYouTube(pageToken, 'date', true);
        allItems.push(...result.items);
        if (!result.nextPageToken) break;
        pageToken = result.nextPageToken;
      }
      allItems.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      popular = { items: allItems };
    } catch (err: unknown) {
      this.logger.error(`searchPopularVideos 실패: ${toErrorMessage(err)}`);
      await this.youtubeRedis.del(LOCK_POPULAR_KEY).catch(() => {});
      return { items: [], nextOffset: null, hasMore: false, total: 0 };
    }

    try {
      await this.youtubeRedis.set(
        POPULAR_CACHE_KEY,
        JSON.stringify(popular),
        'EX',
        CACHE_TTL,
      );
    } catch (error: unknown) {
      this.logger.debug(
        `popular 캐시 저장 실패(무시): ${toErrorMessage(error)}`,
      );
    } finally {
      await this.youtubeRedis.del(LOCK_POPULAR_KEY).catch(() => {});
    }

    return this.slicePopular(popular.items, safeOffset, safeLimit);
  }

  private slicePopular(
    allItems: YoutubeVideoItem[],
    offset: number,
    limit: number,
  ): PopularResponse {
    if (limit <= 0) {
      return {
        items: allItems,
        nextOffset: null,
        hasMore: false,
        total: allItems.length,
      };
    }

    const items = allItems.slice(offset, offset + limit);
    const consumed = offset + items.length;
    const hasMore = consumed < allItems.length;

    return {
      items,
      nextOffset: hasMore ? consumed : null,
      hasMore,
      total: allItems.length,
    };
  }

  private async fetchFromYouTube(
    pageToken?: string,
    order: 'date' | 'viewCount' = 'date',
    isPopular = false,
    query = '로스트아크',
  ): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    const total = this.youtubeKeys.length;
    for (let attempt = 0; attempt < total; attempt++) {
      try {
        return await this._doFetch(pageToken, order, isPopular, query);
      } catch (err: unknown) {
        const reason =
          toYoutubeApiError(err).response?.data?.error?.errors?.[0]?.reason;
        if (
          (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') &&
          attempt < total - 1
        ) {
          this.currentKeyIdx = (this.currentKeyIdx + 1) % total;
          this.logger.warn(
            `YouTube 키 ${attempt + 1}/${total} 할당량 초과 — 키 ${this.currentKeyIdx + 1}로 전환`,
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
    isPopular = false,
    query = '로스트아크',
  ): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    // 1. 동영상 검색 (최신순)
    const searchRes = await this.youtube.search.list({
      part: ['id', 'snippet'],
      q: query,
      type: ['video'],
      order,
      ...(isPopular
        ? {
            publishedAfter: (() => {
              const d = new Date();
              d.setDate(d.getDate() - 7); // 7일 전
              d.setHours(0, 0, 0, 0);
              return d.toISOString();
            })(),
          }
        : {}),
      relevanceLanguage: 'ko',
      regionCode: 'KR',
      maxResults: isPopular ? POPULAR_MAX_RESULTS : MAX_RESULTS,
      ...(pageToken ? { pageToken } : {}),
    });

    const nextPageToken = searchRes.data.nextPageToken ?? null;

    const videoIds = (searchRes.data.items ?? [])
      .map((i) => i.id?.videoId)
      .filter(Boolean) as string[];

    if (videoIds.length === 0) return { items: [], nextPageToken };

    // 2. 영상 상세 (재생시간 + 조회수) 조회
    const detailsRes = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds,
    });

    const items: YoutubeVideoItem[] = (detailsRes.data.items ?? [])
      .filter((v) => {
        const sec = parseDurationSec(v.contentDetails?.duration ?? '');
        const minSec = 300; // 5분 이상 (숏츠 제외)
        if (sec < minSec) return false;
        if (sec >= 3600) return false; // 1시간 이상 제외
        if (parseInt(v.statistics?.viewCount ?? '0', 10) < 500) return false; // 조회수 500 미만 제외
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

function toYoutubeApiError(error: unknown): YoutubeApiErrorShape {
  if (typeof error === 'object' && error !== null) {
    return error as YoutubeApiErrorShape;
  }
  return {};
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
