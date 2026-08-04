import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type Redis as RedisClient } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

function isTruthy(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/**
 * 이름은 "YouTube" 지만 실제로는 "운영(EC2) Redis" 다 — YouTube(영상·라이브)와
 * Chzzk 라이브 캐시가 모두 같은 인스턴스를 공유한다. 로컬에서 YOUTUBE_REDIS_HOST 를
 * SSH 터널로 지정하면 운영 캐시를 그대로 읽는다. 운영에서는 이 값이 지정되지
 * 않아 기본 REDIS_CLIENT 와 동일 객체가 된다.
 * (streamers.service.ts 에 있던 것을 분리 — youtube-videos/-live, chzzk-live 가 공유)
 */
@Injectable()
export class StreamingRedisService {
  private readonly logger = new Logger(StreamingRedisService.name);
  readonly client: RedisClient;
  /** 위 Redis 를 읽기 전용으로 쓴다(= 로컬). 갱신 크론을 돌리지 않고 캐시만 읽는다. */
  readonly readOnly: boolean;

  constructor(
    @Inject(REDIS_CLIENT) defaultRedis: RedisClient,
    config: ConfigService,
  ) {
    this.readOnly = isTruthy(config.get<string>('YOUTUBE_REDIS_READONLY'));

    const host = config.get<string>('YOUTUBE_REDIS_HOST');
    if (host) {
      this.client = new Redis({
        host,
        port: config.get<number>('YOUTUBE_REDIS_PORT', 6379),
        password: config.get<string>('YOUTUBE_REDIS_PASSWORD') || undefined,
        db: config.get<number>('YOUTUBE_REDIS_DB', 0),
        lazyConnect: true,
      });
      this.logger.log(
        `운영 Redis 사용(YouTube·Chzzk 캐시) — ${host}:${config.get<number>('YOUTUBE_REDIS_PORT', 6379)}`,
      );
    } else {
      this.client = defaultRedis;
    }
  }
}
