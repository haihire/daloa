import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Pool } from 'mysql2/promise';
import type { Redis } from 'ioredis';
import { DB_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import { KakaoService, type SiteChange } from '../kakao/kakao.service';

const CACHE_KEY = 'sites:all';
const CACHE_TTL_SEC = 600; // 10분

@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);

  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly kakao: KakaoService,
  ) {}

  /** GET /api/sites — Redis 캐시 우선, 없으면 DB 조회 후 캐시 저장 */
  async findAll() {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      this.logger.debug('sites: Redis 캐시 히트');
      return JSON.parse(cached);
    }

    const [rows] = await (this.pool as any).execute(
      'SELECT seq, name, href, category, description, icon FROM loa_sites WHERE is_active = 1 ORDER BY seq',
    );

    await this.redis.set(CACHE_KEY, JSON.stringify(rows), 'EX', CACHE_TTL_SEC);
    this.logger.debug('sites: DB 조회 후 Redis 캐시 저장');
    return rows;
  }

  /**
   * 매일 오전 9시 — 각 사이트 상태·타이틀 점검
   * 변경 감지 시 카카오톡 알림 전송
   */
  @Cron('0 0 9 * * *')
  async checkSites() {
    this.logger.log('사이트 일일 점검 시작');
    const [rows] = await (this.pool as any).execute(
      'SELECT seq, name, href, last_title, last_status FROM loa_sites WHERE is_active = 1',
    ) as [any[], any];

    const changes: SiteChange[] = [];

    await Promise.allSettled(
      rows.map(async (site) => {
        let status = 0;
        let newTitle: string | null = null;

        try {
          const res = await fetch(site.href, {
            method: 'GET',
            signal: AbortSignal.timeout(10_000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LoaHubBot/1.0)' },
          });
          status = res.status;

          if (res.ok) {
            const html = await res.text();
            const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            newTitle = match ? match[1].trim().slice(0, 200) : null;
          }
        } catch {
          status = 0; // 타임아웃 or 네트워크 오류
        }

        const change: SiteChange = {
          name: site.name,
          titleChanged: false,
          downChanged: false,
          isDown: status === 0 || status >= 500,
          status,
        };

        // 타이틀 변경 감지
        if (newTitle && site.last_title && newTitle !== site.last_title) {
          change.titleChanged = true;
          change.oldTitle = site.last_title;
          change.newTitle = newTitle;
        }

        // 접속 가능 여부 변경 감지
        const wasDown = site.last_status === 0 || (site.last_status != null && site.last_status >= 500);
        if (site.last_status != null && wasDown !== change.isDown) {
          change.downChanged = true;
        }

        if (change.titleChanged || change.downChanged) {
          changes.push(change);
        }

        // DB 업데이트
        await (this.pool as any).execute(
          `UPDATE loa_sites
              SET last_title  = ?,
                  last_status = ?,
                  checked_at  = NOW()
            WHERE seq = ?`,
          [newTitle ?? site.last_title, status, site.seq],
        );
      }),
    );

    this.logger.log(`점검 완료. 변경 감지 ${changes.length}건`);

    // 점검 후 캐시 무효화 → 다음 요청 시 최신 DB 데이터 반영
    await this.redis.del(CACHE_KEY);

    if (changes.length > 0) {
      await this.kakao.notifySiteChange(changes);
    }
  }
}

