import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { google } from 'googleapis';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

const CACHE_PREFIX = 'youtube:videos:page:';
const CACHE_TTL = 2 * 60 * 60; // 2시간
const QUOTA_KEY = 'youtube:quota_exceeded';
const MAX_RESULTS = 20;

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
    const result = await this.fetchFromYouTube(pageToken);

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis set 실패', (err as Error).message);
    }

    return result;
  }

  private async fetchFromYouTube(pageToken?: string): Promise<{
    items: YoutubeVideoItem[];
    nextPageToken: string | null;
  }> {
    // 1. 동영상 검색 (최신순)
    const searchRes = await this.youtube.search.list({
      part: ['id', 'snippet'],
      q: '로스트아크',
      type: ['video'],
      order: 'date',
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

    // 2. 영상 상세 (재생시간) 조회
    const detailsRes = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails'],
      id: videoIds,
    });

    const items: YoutubeVideoItem[] = (detailsRes.data.items ?? [])
      .filter((v) => {
        const sec = parseDurationSec(v.contentDetails?.duration ?? '');
        return sec > 0 && sec < 3600; // 1초 이상, 1시간 미만
      })
      .map((v) => ({
        videoId: v.id ?? '',
        title: v.snippet?.title ?? '',
        channelTitle: v.snippet?.channelTitle ?? '',
        thumbnailUrl:
          v.snippet?.thumbnails?.medium?.url ??
          v.snippet?.thumbnails?.default?.url ??
          '',
        publishedAt: v.snippet?.publishedAt ?? '',
        duration: formatDuration(v.contentDetails?.duration ?? ''),
      }));

    return { items, nextPageToken };
  }
}
