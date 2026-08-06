import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { AdminWriteGuard } from '../auth/admin.guard';

const CACHE_KEYS: Record<string, string> = {
  sites: 'sites:all',
};

@Controller('api/admin/cache')
@UseGuards(AdminWriteGuard)
export class AdminCacheController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  @Post('purge')
  async purge(@Body() body: { key?: string }) {
    if (!body.key) throw new BadRequestException('key는 필수입니다');

    const redisKey = CACHE_KEYS[body.key];
    if (!redisKey) {
      throw new BadRequestException(
        `유효한 key: ${Object.keys(CACHE_KEYS).join(', ')}`,
      );
    }

    const deleted = await this.redis.del(redisKey);
    return { ok: true, deleted, redisKey };
  }

  @Post('purge-all')
  async purgeAll() {
    const keys = Object.values(CACHE_KEYS);
    const results = await Promise.all(keys.map((k) => this.redis.del(k)));
    return {
      ok: true,
      deleted: results.reduce((a, b) => a + b, 0),
      keys,
    };
  }
}
