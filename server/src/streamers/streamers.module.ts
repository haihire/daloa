import { Module } from '@nestjs/common';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { RedisModule } from '../redis/redis.module';
import { StreamersRepository } from './streamers.repository';
import { ChzzkClient } from './chzzk.client';

@Module({
  imports: [RedisModule],
  controllers: [StreamersController],
  providers: [StreamersService, StreamersRepository, ChzzkClient],
  exports: [StreamersService],
})
export class StreamersModule {}
