import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { runIfLockAcquired } from '../common/cron-lock.util';
import { KakaoService, type SiteChange } from '../kakao/kakao.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SitesRepository, type SiteRecord } from './sites.repository';

const CACHE_KEY = 'sites:all';
const CACHE_TTL_SEC = 600;

const SITE_TEXT_CANONICAL: Record<
  string,
  { name: string; description: string }
> = {
  'https://kloa.gg/': {
    name: 'KLoa',
    description: 'Lost Ark utility site',
  },
  'https://lostark.inven.co.kr/': {
    name: 'Lost Ark Inven',
    description: 'Lost Ark community',
  },
  'https://sasagefind.com/': {
    name: 'Sasage search',
    description: 'Lost Ark user search',
  },
  'https://lo4.app/': {
    name: 'LOALAB',
    description: 'Lost Ark tool collection',
  },
};

const hasBrokenText = (value: unknown): value is string =>
  typeof value === 'string' && /\?{2,}/.test(value);

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
      const parsedCache = JSON.parse(cached) as SiteRecord[];
      const brokenInCache = parsedCache.filter(
        (row) => hasBrokenText(row.name) || hasBrokenText(row.description),
      );
      if (brokenInCache.length === 0) {
        this.logger.debug('sites: Redis cache hit');
        return parsedCache;
      }

      this.logger.warn(
        `sites: broken text detected in cache (${brokenInCache.length}). Reload from DB.`,
      );
      await this.redis.del(CACHE_KEY);
    }

    const rows = await this.sitesRepo.findActive();
    await this.repairBrokenCanonicalRows(rows);

    const stillBroken = rows.some(
      (row) => hasBrokenText(row.name) || hasBrokenText(row.description),
    );
    if (!stillBroken) {
      await this.redis.set(
        CACHE_KEY,
        JSON.stringify(rows),
        'EX',
        CACHE_TTL_SEC,
      );
      this.logger.debug('sites: DB rows cached in Redis');
    } else {
      this.logger.warn('sites: skip Redis cache because broken text remains');
    }

    return rows;
  }

  private async repairBrokenCanonicalRows(rows: SiteRecord[]): Promise<void> {
    const allBrokenRows = rows.filter(
      (row) => hasBrokenText(row.name) || hasBrokenText(row.description),
    );

    const brokenRows = allBrokenRows.filter(
      (row) => !!SITE_TEXT_CANONICAL[row.href],
    );
    const unknownBrokenRows = allBrokenRows.filter(
      (row) => !SITE_TEXT_CANONICAL[row.href],
    );

    if (unknownBrokenRows.length > 0) {
      this.logger.error(
        `sites: broken text cannot be repaired automatically: ${unknownBrokenRows
          .map((row) => row.href)
          .join(', ')}`,
      );
    }

    if (brokenRows.length === 0) return;

    await Promise.all(
      brokenRows.map(async (row) => {
        const canonical = SITE_TEXT_CANONICAL[row.href];
        if (!canonical) return;

        await this.sitesRepo.updateText(row.seq, {
          name: canonical.name,
          description: canonical.description,
        });

        row.name = canonical.name;
        row.description = canonical.description;
      }),
    );

    this.logger.warn(`sites: repaired broken text rows (${brokenRows.length})`);
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
