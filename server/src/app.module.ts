import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LostarkModule } from './lostark/lostark.module';
import { SitesModule } from './sites/sites.module';
import { RedisModule } from './redis/redis.module';
import { KakaoModule } from './kakao/kakao.module';
import { StreamersModule } from './streamers/streamers.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { FeedbackModule } from './feedback/feedback.module';
import { RevalidateService } from './revalidate/revalidate.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    // 모든 워커에 등록한다(워커0 전용 게이팅 없음). 실행 시점 중복 방지는 각 @Cron이
    // 개별적으로 Redis 락(runIfLockAcquired/acquireLock)으로 처리하며, 이 락은 워커
    // 고정이 아니라 "그 틱에 먼저 잡은 프로세스만 실행"이라 특정 워커가 죽어도
    // 다른 워커가 자연스럽게 이어받는다(cron-lock.util.ts 주석의 페일오버가 실제로 동작).
    ScheduleModule.forRoot(),
    LostarkModule,
    SitesModule,
    RedisModule,
    KakaoModule,
    StreamersModule,
    UsersModule,
    AdminModule,
    FeedbackModule,
    PrismaModule,
  ],
  providers: [RevalidateService],
})
export class AppModule {}
