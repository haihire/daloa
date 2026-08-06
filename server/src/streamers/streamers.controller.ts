import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StreamersService } from './streamers.service';

/**
 * 라이브 목록의 CDN 캐시 수명(초). 화면의 "새로고침"은 이 캐시를 읽을 뿐이라
 * 연타해도 원본까지 오지 않는다 — 즉 이 값이 곧 원본 보호 장치다.
 *
 * 갱신 크론 주기의 절반 정도로 잡는다. 크론이 채운 직후 캐시가 만들어질 수도,
 * 채우기 직전에 만들어질 수도 있어서, 최악의 노출 지연 = 크론 주기 + s-maxage 다.
 *
 * stale-while-revalidate: 만료 직후엔 낡은 값을 그대로 주면서 뒤에서 갱신한다.
 * 만료 순간에 요청이 몰려도 원본으로 한꺼번에 쏟아지지 않는다.
 */
const LIVE_CDN_CACHE = {
  chzzk: 'public, s-maxage=150, stale-while-revalidate=60', // 크론 5분
  youtube: 'public, s-maxage=600, stale-while-revalidate=120', // 크론 20분
} as const;

@Controller('api/streamers')
export class StreamersController {
  constructor(private readonly streamersService: StreamersService) {}

  /**
   * GET /api/streamers?pageToken=xxx
   * 로스트아크 최신 동영상 검색 (1시간 미만, Redis 10분 캐시)
   */
  @Get()
  searchVideos(@Query('pageToken') pageToken?: string) {
    return this.streamersService.searchVideos(pageToken);
  }

  /**
   * GET /api/streamers/live?platform=chzzk|youtube&minViewers=100
   * 실시간 라이브 스트리머 (Redis 캐시)
   * - platform=chzzk (기본, TTL 90초)
   * - platform=youtube (TTL 12분)
   */
  @Get('live')
  getLivesStreamers(
    @Res({ passthrough: true }) res: Response,
    @Query('platform') platform: string = 'chzzk',
    @Query('minViewers') minViewersRaw?: string,
  ) {
    const minViewers = Number.parseInt(minViewersRaw ?? '0', 10);
    const normalizedPlatform = platform === 'youtube' ? 'youtube' : 'chzzk';

    // 플랫폼마다 갱신 주기가 4배 차이라 CDN 수명도 따로 준다.
    // (@Header 데코레이터는 고정값이라 여기서 직접 설정)
    res.setHeader('Cache-Control', LIVE_CDN_CACHE[normalizedPlatform]);

    if (normalizedPlatform === 'youtube') {
      return this.streamersService.getYoutubeLives(
        Number.isNaN(minViewers) ? 0 : minViewers,
      );
    }

    return this.streamersService.getChzzkLives(
      Number.isNaN(minViewers) ? 0 : minViewers,
    );
  }
}
