import { Module } from '@nestjs/common';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { RedisModule } from '../redis/redis.module';
import { ChzzkClient } from './chzzk.client';
import { StreamingRedisService } from './streaming-redis.service';
import { YoutubeApiService } from './youtube-api.service';
import { YoutubeVideosService } from './youtube-videos.service';
import { YoutubeLiveService } from './youtube-live.service';
import { ChzzkLiveService } from './chzzk-live.service';

@Module({
  imports: [RedisModule],
  controllers: [StreamersController],
  providers: [
    StreamersService,
    ChzzkClient,
    StreamingRedisService,
    YoutubeApiService,
    YoutubeVideosService,
    YoutubeLiveService,
    ChzzkLiveService,
  ],
  exports: [StreamersService],
})
export class StreamersModule {}
