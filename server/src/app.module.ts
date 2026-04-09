import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DbModule } from './db/db.module';
import { LostarkModule } from './lostark/lostark.module';
import { CharactersModule } from './characters/characters.module';
import { SitesModule } from './sites/sites.module';
import { RedisModule } from './redis/redis.module';
import { KakaoModule } from './kakao/kakao.module';
import { StreamersModule } from './streamers/streamers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DbModule,
    LostarkModule,
    CharactersModule,
    SitesModule,
    RedisModule,
    KakaoModule,
    StreamersModule,
    UsersModule,
  ],
})
export class AppModule {}
