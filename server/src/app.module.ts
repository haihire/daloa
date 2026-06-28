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
import { RevalidateService } from './revalidate/revalidate.service';
import { PrismaModule } from './prisma/prisma.module';

// NODE_APP_INSTANCE: PM2가 워커마다 '0','1'... 자동 주입. 로컬/비클러스터는 undefined.
const runScheduler =
  process.env.NODE_APP_INSTANCE === '0' ||
  process.env.NODE_APP_INSTANCE === undefined;

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ...(runScheduler ? [ScheduleModule.forRoot()] : []),
    LostarkModule,
    SitesModule,
    RedisModule,
    KakaoModule,
    StreamersModule,
    UsersModule,
    AdminModule,
    PrismaModule,
  ],
  providers: [RevalidateService],
})
export class AppModule {}
