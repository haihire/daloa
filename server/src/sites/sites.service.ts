import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { runIfLockAcquired } from '../common/cron-lock.util';
import { KakaoService, type SiteChange } from '../kakao/kakao.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SitesRepository, type SiteRecord } from './sites.repository';

const CACHE_KEY = 'sites:all';
const CACHE_TTL_SEC = 600;

@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);

  constructor(
    private readonly sitesRepo: SitesRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly kakao: KakaoService,
  ) {}

  async findAll(): Promise<SiteRecord[]> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      this.logger.debug('sites: Redis cache hit');
      return JSON.parse(cached) as SiteRecord[];
    }

    const rows = await this.sitesRepo.findActive();
    await this.redis.set(CACHE_KEY, JSON.stringify(rows), 'EX', CACHE_TTL_SEC);
    this.logger.debug('sites: DB rows cached in Redis');
    return rows;
  }

  async invalidateCache(): Promise<void> {
    await this.redis.del(CACHE_KEY);
    this.logger.debug('sites: cache invalidated');
  }

  @Cron('0 0 9 * * *')
  async checkSites() {
    // PM2 cluster 여러 워커가 동시에 도는 것 방지 — 락 잡은 워커만 실행(페일오버 지원).
    await runIfLockAcquired(this.redis, 'checkSites', () =>
      this.checkSitesJob(),
    );
  }

  private async checkSitesJob() {
    this.logger.log('sites: daily status check started');
    const rows = await this.sitesRepo.findActiveForChecks();

    const changes: SiteChange[] = [];

    await Promise.allSettled(
      rows.map(async (site) => {
        let status = 0;
        let newTitle: string | null = null;

        try {
          const res = await fetch(site.href, {
            method: 'GET',
            signal: AbortSignal.timeout(10_000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LoaHubBot/1.0)',
            },
          });
          status = res.status;

          if (res.ok) {
            const html = await res.text();
            const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            newTitle = match ? match[1].trim().slice(0, 200) : null;
          }
        } catch {
          status = 0;
        }

        const change: SiteChange = {
          name: site.name,
          titleChanged: false,
          downChanged: false,
          isDown: status === 0 || status >= 500,
          status,
        };

        if (newTitle && site.last_title && newTitle !== site.last_title) {
          change.titleChanged = true;
          change.oldTitle = site.last_title;
          change.newTitle = newTitle;
        }

        const wasDown =
          site.last_status === 0 ||
          (site.last_status != null && site.last_status >= 500);
        if (site.last_status != null && wasDown !== change.isDown) {
          change.downChanged = true;
        }

        if (change.titleChanged || change.downChanged) {
          changes.push(change);
        }

        await this.sitesRepo.updateCheckResult(site.seq, {
          last_title: newTitle ?? site.last_title,
          last_status: status,
        });
      }),
    );

    this.logger.log(
      `sites: daily status check finished. changes=${changes.length}`,
    );
    await this.redis.del(CACHE_KEY);

    if (changes.length > 0) {
      await this.kakao.notifySiteChange(changes);
    }
  }
}
