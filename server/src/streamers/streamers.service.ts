import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { google } from 'googleapis';
import Redis, { type Redis as RedisClient } from 'ioredis';
import { isLocalQuotaApisDisabled } from '../common/local-dev-flags';
import { REDIS_CLIENT } from '../redis/redis.module';
import { StreamersRepository } from './streamers.repository';
import { ChzzkClient, type ChzzkLiveItem } from './chzzk.client';

const CACHE_PREFIX = 'youtube:videos:page:';
const POPULAR_CACHE_KEY = 'youtube:popular:first';
const CACHE_TTL = 4 * 60 * 60; // 4시간 (Cron 3시간 갱신 + 여유)
const QUOTA_KEY = 'youtube:quota_exceeded';
const LOCK_VIDEOS_KEY = 'youtube:lock:videos';
const LOCK_TTL = 60; // 락 최대 60초 유지
const MAX_RESULTS = 20;
const POPULAR_MAX_RESULTS = 50;
const POPULAR_MAX_LIMIT = 50;
const POPULAR_MAX_PAGES = 8;
const POPULAR_WINDOW_DAYS = 7; // 인기 영상 노출 창(게시일 기준 최근 7일)
const BLOCKED_KEY = 'youtube:blocked'; // 관리자가 숨긴 videoId Set

// Chzzk 라이브
const CHZZK_LIVE_CACHE_KEY = 'live:chzzk:current';
const CHZZK_LIVE_CACHE_TTL = 90; // 90초 (크론 1분 + 1.5배 grace)

// YouTube 라이브
const YOUTUBE_LIVE_CACHE_KEY = 'live:youtube:current';
const YOUTUBE_LIVE_CACHE_TTL = 720; // 12분 (크론 10분 + 여유)
// 참고: 라이브 폴링당 쿼터 ≈ search.list(100) + videos.list(1) = 101 units

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

/**
 * videoId 기준으로 중복 영상을 제거한다.
 * YouTube search.list는 페이지 사이에 새 업로드가 발생하거나 결과 순서가
 * 변경되면 동일한 videoId를 여러 페이지에서 반환할 수 있다.
 */
function dedupByVideoId(items: YoutubeVideoItem[]): YoutubeVideoItem[] {
  const seen = new Set<string>();
  const out: YoutubeVideoItem[] = [];
  for (const item of items) {
    if (seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    out.push(item);
  }
  return out;
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
    private readonly streamersRepo: StreamersRepository,
    private readonly config: ConfigService,
    private readonly chzzk: ChzzkClient,
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
    // PM2 cluster: 워커0(또는 비클러스터=undefined)만 실행. 동시 YouTube API 호출/UPSERT 방지.
    const inst = process.env.NODE_APP_INSTANCE;
    if (inst !== undefined && inst !== '0') return;

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
      const uniqueItems = dedupByVideoId(allItems);
      uniqueItems.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      // 1) 새로 가져온 영상을 DB에 누적 저장(메타데이터 + 조회수 스냅샷)
      await this.snapshotViewCounts(uniqueItems);
      // 2) 서빙 캐시는 DB의 최근 7일 누적분(관리자 숨김 제외)으로 재구성한다.
      //    YouTube 검색이 도달하지 못해 이번에 안 잡힌 영상도 게시일이
      //    7일 이내면 DB에 남아 있어 계속 노출된다(= 누적 서빙).
      const recent = await this.loadServingList();
      await this.cachePopular(recent);
      this.logger.log(
        `YouTube 인기 영상 ${recent.length}건 캐시 저장 (DB 누적 ${POPULAR_WINDOW_DAYS}일)`,
      );
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

  /** 현재 인기 영상의 조회수를 오늘 날짜로 DB에 저장 (UPSERT) */
  async snapshotViewCounts(items: YoutubeVideoItem[]): Promise<void> {
    if (items.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await this.streamersRepo.upsertViewSnapshots(items, today);
      this.logger.log(
        `YouTube 조회수 스냅샷 ${items.length}건 저장 (${today})`,
      );
    } catch (err: unknown) {
      this.logger.error(`YouTube 스냅샷 저장 실패: ${toErrorMessage(err)}`);
    }
  }

  /** 날짜별 평균 조회수 히스토리 반환 */
  async getViewHistory(days: number): Promise<{ date: string; avg: number }[]> {
    const safeDay = Math.min(Math.max(1, days), 365);
    try {
      return this.streamersRepo.findViewHistory(safeDay);
    } catch (err: unknown) {
      this.logger.error(`YouTube 히스토리 조회 실패: ${toErrorMessage(err)}`);
      return [];
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
   * 게시일 기준 최근 7일 영상을 DB 누적분에서 서빙한다.
   * Redis 캐시는 DB 조회 결과를 담는 읽기 캐시일 뿐이며, YouTube API는
   * 호출하지 않는다(갱신은 refresh() 크론이 전담).
   * offset/limit 미지정 시 전체 목록, 지정 시 분할 반환.
   */
  async searchPopularVideos(offset = 0, limit = 0): Promise<PopularResponse> {
    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.min(Math.max(0, limit), POPULAR_MAX_LIMIT);

    // 1. Redis 읽기 캐시 (DB 누적분을 캐싱한 결과)
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

    // 2. 캐시 미스 → DB에서 최근 7일 누적분(관리자 숨김 제외) 조회 후 캐싱
    let items: YoutubeVideoItem[];
    try {
      items = await this.loadServingList();
    } catch (err: unknown) {
      this.logger.error(`popular DB 조회 실패: ${toErrorMessage(err)}`);
      return { items: [], nextOffset: null, hasMore: false, total: 0 };
    }

    await this.cachePopular(items);
    return this.slicePopular(items, safeOffset, safeLimit);
  }

  /**
   * DB의 최근 7일 누적분에서 관리자가 숨긴(blocked) 영상을 제외한 서빙 목록.
   * refresh()와 searchPopularVideos() 양쪽이 캐시를 만들 때 공통으로 쓰므로
   * 캐시를 purge해도 숨김은 항상 다시 적용된다.
   */
  private async loadServingList(): Promise<YoutubeVideoItem[]> {
    const items =
      await this.streamersRepo.findRecentVideos(POPULAR_WINDOW_DAYS);
    const blocked = await this.getBlockedIds();
    if (blocked.size === 0) return items;
    return items.filter((v) => !blocked.has(v.videoId));
  }

  /** 관리자가 숨긴 videoId 집합 */
  private async getBlockedIds(): Promise<Set<string>> {
    try {
      const ids = await this.youtubeRedis.smembers(BLOCKED_KEY);
      return new Set(ids);
    } catch (error: unknown) {
      this.logger.debug(`숨김 목록 조회 실패(무시): ${toErrorMessage(error)}`);
      return new Set();
    }
  }

  /** 영상을 숨김 목록에 추가하고 서빙 캐시를 비워 즉시 반영 */
  async blockVideo(videoId: string): Promise<void> {
    if (this.youtubeRedisReadOnly) {
      throw new Error('YOUTUBE_REDIS_READONLY 활성화 — 숨김 쓰기 불가');
    }
    await this.youtubeRedis.sadd(BLOCKED_KEY, videoId);
    await this.youtubeRedis.del(POPULAR_CACHE_KEY).catch(() => {});
    this.logger.log(`YouTube 영상 숨김: ${videoId}`);
  }

  /** 영상을 숨김 목록에서 제거(복원)하고 서빙 캐시를 비움 */
  async unblockVideo(videoId: string): Promise<void> {
    if (this.youtubeRedisReadOnly) {
      throw new Error('YOUTUBE_REDIS_READONLY 활성화 — 숨김 쓰기 불가');
    }
    await this.youtubeRedis.srem(BLOCKED_KEY, videoId);
    await this.youtubeRedis.del(POPULAR_CACHE_KEY).catch(() => {});
    this.logger.log(`YouTube 영상 숨김 해제: ${videoId}`);
  }

  /** 숨김 목록(videoId 배열) */
  async listBlocked(): Promise<string[]> {
    return this.getBlockedIds().then((s) => [...s]);
  }

  /** DB의 최근 7일 영상 목록을 popular 읽기 캐시에 저장 */
  private async cachePopular(items: YoutubeVideoItem[]): Promise<void> {
    // 로컬 dev가 공유 EC2 Redis를 읽기 전용으로 붙는 경우 쓰기 금지
    if (this.youtubeRedisReadOnly) return;
    try {
      await this.youtubeRedis.set(
        POPULAR_CACHE_KEY,
        JSON.stringify({ items }),
        'EX',
        CACHE_TTL,
      );
    } catch (error: unknown) {
      this.logger.debug(
        `popular 캐시 저장 실패(무시): ${toErrorMessage(error)}`,
      );
    }
  }

  private slicePopular(
    allItems: YoutubeVideoItem[],
    offset: number,
    limit: number,
  ): PopularResponse {
    // 이미 캐시에 저장된 데이터가 중복을 포함할 수 있으므로 방어적으로 제거
    const uniqueItems = dedupByVideoId(allItems);

    if (limit <= 0) {
      return {
        items: uniqueItems,
        nextOffset: null,
        hasMore: false,
        total: uniqueItems.length,
      };
    }

    const items = uniqueItems.slice(offset, offset + limit);
    const consumed = offset + items.length;
    const hasMore = consumed < uniqueItems.length;

    return {
      items,
      nextOffset: hasMore ? consumed : null,
      hasMore,
      total: uniqueItems.length,
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

  /** Chzzk 라이브 조회 및 캐시 저장 */
  private async updateChzzkLives(): Promise<void> {
    try {
      const lives = await this.chzzk.fetchLivesByCategory();
      if (lives.length === 0) {
        this.logger.warn(`Chzzk 라이브 갱신: 로아 라이브 0개 (캐시 미갱신)`);
        return;
      }
      const serialized = JSON.stringify(lives);
      await this.redis.setex(
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

  /** Chzzk 라이브 조회 (캐시 우선, 없으면 직접 API 호출) */
  async getChzzkLives(minViewers = 0): Promise<ChzzkLiveItem[]> {
    try {
      // 1. 캐시 확인
      const cached = await this.redis.get(CHZZK_LIVE_CACHE_KEY);
      if (cached) {
        const lives = JSON.parse(cached) as ChzzkLiveItem[];
        const filtered = this.chzzk.filterByViewerCount(lives, minViewers);
        this.logger.debug(
          `Chzzk 캐시 hit: ${lives.length}개 → 필터링 후 ${filtered.length}개 (최소시청자 ${minViewers})`,
        );
        return filtered;
      }

      // 2. 캐시 없으면 직접 API 호출
      this.logger.debug('Chzzk 캐시 미스 → 직접 API 호출');
      const lives = await this.chzzk.fetchLivesByCategory();
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
    const inst = process.env.NODE_APP_INSTANCE;
    if (inst !== undefined && inst !== '0') return;
    await this.updateChzzkLives();
  }

  /** YouTube 라이브 조회 및 캐시 저장 (키 할당량 초과 시 다음 키로 회전) */
  private async updateYoutubeLives(): Promise<void> {
    // 쿼터 단축: 모든 키 소진이 기록돼 있으면 직전 캐시 유지
    const quotaExceeded = await this.redis.get(QUOTA_KEY);
    if (quotaExceeded) {
      this.logger.warn('YouTube 라이브: 쿼터 초과 → 직전 캐시 유지');
      return;
    }

    // 검색 경로(fetchWithRotation)와 동일하게, 키 할당량 초과 시 다음 키로 전환하며 재시도.
    const total = this.youtubeKeys.length;
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
          this.currentKeyIdx = (this.currentKeyIdx + 1) % total;
          this.logger.warn(
            `YouTube 라이브 키 ${attempt + 1}/${total} 할당량 초과 — 키 ${this.currentKeyIdx + 1}로 전환`,
          );
          continue;
        }

        if (isQuota) {
          // 모든 키 소진: 리셋까지 단축 플래그를 세워 불필요한 재호출(2.5s) 방지
          const ttl = secondsUntilQuotaReset();
          await this.redis.set(QUOTA_KEY, '1', 'EX', ttl).catch(() => {});
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
    const searchRes = await this.youtube.search.list({
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
    const videosRes = await this.youtube.videos.list({
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

  /** YouTube 라이브 조회 (캐시 우선, 없으면 직접 API 호출) */
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

      // 2. 캐시 없으면 직접 API 호출
      this.logger.debug('YouTube 캐시 미스 → 직접 API 호출');
      await this.updateYoutubeLives();

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
    const inst = process.env.NODE_APP_INSTANCE;
    if (inst !== undefined && inst !== '0') return;

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
