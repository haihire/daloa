import { Injectable } from '@nestjs/common';
import { YoutubeVideosService } from './youtube-videos.service';
import { YoutubeLiveService } from './youtube-live.service';
import { ChzzkLiveService } from './chzzk-live.service';

export type { YoutubeVideoItem } from './youtube-videos.service';

/**
 * 파사드: streamers.controller.ts 가 기대하는 API 형태를 유지한 채, 실제 구현은
 * 3가지 책임(영상 검색 / YouTube 라이브 / Chzzk 라이브)으로 분리된 서비스에 위임한다.
 * 각 서비스의 @Cron·OnModuleInit 은 StreamersModule의 providers에 등록되는 것만으로
 * 독립적으로 동작하며 이 파사드를 거치지 않는다.
 */
@Injectable()
export class StreamersService {
  constructor(
    private readonly videos: YoutubeVideosService,
    private readonly youtubeLive: YoutubeLiveService,
    private readonly chzzkLive: ChzzkLiveService,
  ) {}

  searchVideos(pageToken?: string) {
    return this.videos.searchVideos(pageToken);
  }

  getYoutubeLives(minViewers = 0) {
    return this.youtubeLive.getYoutubeLives(minViewers);
  }

  getChzzkLives(minViewers = 0) {
    return this.chzzkLive.getChzzkLives(minViewers);
  }
}
