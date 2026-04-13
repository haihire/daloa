import { Controller, Get, Query } from '@nestjs/common';
import { StreamersService } from './streamers.service';

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
   * GET /api/streamers/popular
   * 로스트아크 최근 30일 동영상 조회수순 (Redis 2시간 캐시)
   */
  @Get('popular')
  searchPopular() {
    return this.streamersService.searchPopularVideos();
  }
}
