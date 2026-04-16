import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { google } from 'googleapis';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

const CACHE_PREFIX = 'youtube:videos:page:';
const POPULAR_CACHE_KEY = 'youtube:popular:first';
const CACHE_TTL = 60 * 60; // 1시간
const QUOTA_KEY = 'youtube:quota_exceeded';
const MAX_RESULTS = 20;
const POPULAR_MAX_RESULTS = 50;

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

@Injectable()
export class StreamersService implements OnModuleInit {
  private readonly logger = new Logger(StreamersService.name);
  private readonly youtube;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.config.get<string>('YOUTUBE_API_KEY'),
    });
  }

  async onModuleInit() {
    // Redis에 캐시가 이미 있으면 API 호출 스킵 (서버 재시작 보호)
    try {
      const cached = await this.redis.get(CACHE_PREFIX + 'first');
      if (cached) {
        this.logger.log('YouTube 캐시 존재 — 시작 시 API 호출 스킵');
        return;
      }
    } catch (_) {}
    await this.refresh();
  }

  /** 매시 정각 갱신 */
  @Cron(CronExpression.EVERY_HOUR)
  async refresh() {
    // 할당량 초과 플래그 확인
    try {
      const blocked = await this.redis.get(QUOTA_KEY);
      if (blocked) {
        const ttl = await this.redis.ttl(QUOTA_KEY);
        this.logger.warn(
          `YouTube 할당량 초과 상태 — ${Math.ceil(ttl / 60)}분 후 리셋`,
        );
        return;
      }
    } catch (_) {}

    this.logger.log('YouTube 영상 목록 갱신 시작');
    try {
      const result = await this.fetchFromYouTube();
      await this.redis.set(
        CACHE_PREFIX + 'first',
        JSON.stringify(result),
        'EX',
        CACHE_TTL,
      );
      this.logger.log(`YouTube 영상 ${result.items.length}건 캐시 저장`);
    } catch (err: any) {
      const status = err?.response?.status;
      const reason = err?.response?.data?.error?.errors?.[0]?.reason;
      this.logger.error(
        `YouTube 갱신 실패 [HTTP ${status ?? 'unknown'}] reason: ${reason ?? 'unknown'}`,
        err?.response?.data?.error?.message ?? (err as Error).message,
      );

      // 할당량 초과 시 리셋 시각까지 플래그 설정
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        const ttl = secondsUntilQuotaReset();
        await this.redis.set(QUOTA_KEY, '1', 'EX', ttl).catch(() => {});
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
      const cached = await this.redis.get(cacheKey);
      if (cached)
        return JSON.parse(cached) as {
          items: YoutubeVideoItem[];
          nextPageToken: string | null;
        };
    } catch (err) {
      this.logger.warn('Redis get 실패', (err as Error).message);
    }

    // 2. 할당량 초과 상태면 빈 결과 반환
    try {
      const blocked = await this.redis.get(QUOTA_KEY);
      if (blocked) return { items: [], nextPageToken: null };
    } catch (_) {}

    // 3. YouTube API 호출
    let result: { items: YoutubeVideoItem[]; nextPageToken: string | null };
    try {
      result = await this.fetchFromYouTube(pageToken);
    } catch (err: any) {
      this.logger.error(`getStreamers 실패: ${err?.message ?? err}`);
      return { items: [], nextPageToken: null };
    }

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis set 실패', (err as Error).message);
    }

    return result;
  }

  /** GET /api/streamers/popular — 오늘 올라온 영상 최신순 (캐시 1시간, 5분 이상 숏츠 제외) */
  async searchPopularVideos(): Promise<{ items: YoutubeVideoItem[] }> {
    try {
      const cached = await this.redis.get(POPULAR_CACHE_KEY);
      if (cached) return JSON.parse(cached) as { items: YoutubeVideoItem[] };
    } catch (_) {}

    try {
      const blocked = await this.redis.get(QUOTA_KEY);
      if (blocked) return { items: [] };
    } catch (_) {}

    let popular: { items: YoutubeVideoItem[] };
    try {
      const result = await this.fetchFromYouTube(undefined, 'date', true);
      popular = { items: result.items };
    } catch (err: any) {
      this.logger.error(`searchPopularVideos 실패: ${err?.message ?? err}`);
      return { items: [] };
    }

    try {
      await this.redis.set(
        POPULAR_CACHE_KEY,
        JSON.stringify(popular),
        'EX',
        CACHE_TTL,
      );
    } catch (_) {}

    return popular;
  }

  private async fetchFromYouTube(
    pageToken?: string,
    order: 'date' | 'viewCount' = 'date',
    isPopular = false,
  ): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    // 1. 동영상 검색 (최신순)
    const searchRes = await this.youtube.search.list({
      part: ['id', 'snippet'],
      q: '로스트아크',
      type: ['video'],
      order,
      ...(isPopular
        ? {
            publishedAfter: (() => {
              const d = new Date();
              d.setDate(d.getDate() - 3); // 3일 전
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
        const maxSec = isPopular ? 3 * 3600 : 3600; // popular: 3시간 이하, 일반: 1시간 미만
        if (sec < 300 || sec >= maxSec) return false; // 5분 이상 (숏츠 제외)
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
