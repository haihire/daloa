import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { Redis } from 'ioredis';
import { DB_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import { KakaoService, type SiteChange } from '../kakao/kakao.service';

const CACHE_KEY = 'sites:all';
const CACHE_TTL_SEC = 600; // 10분

interface SiteRow extends RowDataPacket {
  seq: number;
  name: string;
  href: string;
  category: string | null;
  description: string | null;
  icon: string | null;
}

interface SiteCheckRow extends RowDataPacket {
  seq: number;
  name: string;
  href: string;
  last_title: string | null;
  last_status: number | null;
}

const SITE_TEXT_CANONICAL: Record<
  string,
  { name: string; description: string }
> = {
  'https://kloa.gg/': {
    name: 'KLoa',
    description: '떠상 알림 지원',
  },
  'https://lostark.inven.co.kr/': {
    name: '로스트아크 인벤',
    description: '로아 커뮤니티',
  },
  'https://sasagefind.com/': {
    name: '사사게 검색기',
    description: '범죄자 데이터베이스',
  },
  'https://lo4.app/': {
    name: 'LOALAB',
    description: '재련·경매·치명타 계산기, 음돌 계산기 등 통합 툴',
  },
};

const hasBrokenText = (value: unknown): value is string =>
  typeof value === 'string' && /\?{2,}/.test(value);

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
      const parsedCache = JSON.parse(cached) as Array<{
        seq: number;
        name: string;
        href: string;
        category: string | null;
        description: string | null;
        icon: string | null;
      }>;

      // 캐시에 깨진 텍스트가 있으면 즉시 무효화 후 DB 재조회
      const brokenInCache = parsedCache.filter(
        (row) => hasBrokenText(row.name) || hasBrokenText(row.description),
      );
      if (brokenInCache.length === 0) {
        this.logger.debug('sites: Redis 캐시 히트');
        return parsedCache;
      }

      this.logger.warn(
        `sites: Redis 캐시에서 깨진 텍스트 ${brokenInCache.length}건 감지 — 캐시 무효화 후 DB 재조회`,
      );
      await this.redis.del(CACHE_KEY);
    }

    const [rows] = await this.pool.execute<SiteRow[]>(
      'SELECT seq, name, href, category, description, icon FROM loa_sites WHERE is_active = 1 ORDER BY seq',
    );

    // SITE_TEXT_CANONICAL 등록 사이트: DB 즉시 복구
    // 미등록 사이트: 경고 로그 기록 (관리자가 SITE_TEXT_CANONICAL에 추가해야 함)
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
        `sites: 미등록 사이트에서 깨진 텍스트 감지 (자동 복구 불가) — ` +
          unknownBrokenRows.map((r) => r.href).join(', '),
      );
    }

    if (brokenRows.length > 0) {
      await Promise.all(
        brokenRows.map(async (row) => {
          const canonical = SITE_TEXT_CANONICAL[row.href];
          if (!canonical) {
            return;
          }

          await this.pool.execute(
            `UPDATE loa_sites
                SET name = ?,
                    description = ?
              WHERE seq = ?`,
            [canonical.name, canonical.description, row.seq],
          );

          row.name = canonical.name;
          row.description = canonical.description;
        }),
      );

      this.logger.warn(`sites: 한글 깨짐 ${brokenRows.length}건 자동 복구`);
    }

    // 복구 후에도 여전히 깨진 텍스트가 있으면 캐시에 저장하지 않음 (다음 요청에서 재시도)
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
      this.logger.debug('sites: DB 조회 후 Redis 캐시 저장');
    } else {
      this.logger.warn(
        'sites: 깨진 텍스트 잔존으로 Redis 캐시 저장 생략 — 다음 요청에서 DB 재조회',
      );
    }

    return rows;
  }

  /**
   * 매일 오전 9시 — 각 사이트 상태·타이틀 점검
   * 변경 감지 시 카카오톡 알림 전송
   */
  @Cron('0 0 9 * * *')
  async checkSites() {
    this.logger.log('사이트 일일 점검 시작');
    const [rows] = await this.pool.execute<SiteCheckRow[]>(
      'SELECT seq, name, href, last_title, last_status FROM loa_sites WHERE is_active = 1',
    );

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
        const wasDown =
          site.last_status === 0 ||
          (site.last_status != null && site.last_status >= 500);
        if (site.last_status != null && wasDown !== change.isDown) {
          change.downChanged = true;
        }

        if (change.titleChanged || change.downChanged) {
          changes.push(change);
        }

        // DB 업데이트
        await this.pool.execute(
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
