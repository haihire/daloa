import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SiteRecord {
  seq: number;
  name: string;
  href: string;
  category: string | null;
  description: string | null;
}

export interface AdminSiteRecord extends SiteRecord {
  icon: string | null;
  is_active: number;
  click_count: number;
}

export interface SiteCheckRecord {
  seq: number;
  name: string;
  href: string;
  last_title: string | null;
  last_status: number | null;
}

export interface SiteCreateInput {
  name: string;
  href: string;
  category: string | null;
  description: string | null;
  icon: string | null;
}

export interface SiteUpdateInput {
  name?: string;
  href?: string;
  category?: string | null;
  description?: string | null;
  icon?: string | null;
  is_active?: boolean;
}

@Injectable()
export class SitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(): Promise<SiteRecord[]> {
    const rows = await this.prisma.loa_sites.findMany({
      where: { is_active: true },
      orderBy: { seq: 'asc' },
      select: {
        seq: true,
        name: true,
        href: true,
        category: true,
        description: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      seq: Number(row.seq),
    }));
  }

  async findAdminAll(): Promise<AdminSiteRecord[]> {
    // 각 사이트의 클릭수(apm_site_clicks)를 href 기준으로 LEFT JOIN해 함께 반환
    const rows = await this.prisma.$queryRaw<
      Array<{
        seq: bigint;
        name: string;
        href: string;
        category: string | null;
        description: string | null;
        icon: string | null;
        is_active: boolean | null;
        click_count: bigint;
      }>
    >`
      SELECT s.seq, s.name, s.href, s.category, s.description, s.icon, s.is_active,
             COUNT(c.id) AS click_count
      FROM loa_sites s
      LEFT JOIN apm_site_clicks c ON c.site_href = s.href
      GROUP BY s.seq, s.name, s.href, s.category, s.description, s.icon, s.is_active
      ORDER BY s.seq ASC
    `;

    return rows.map((row) => ({
      seq: Number(row.seq),
      name: row.name,
      href: row.href,
      category: row.category,
      description: row.description,
      icon: row.icon,
      is_active: row.is_active ? 1 : 0,
      click_count: Number(row.click_count),
    }));
  }

  async findBySeq(seq: number): Promise<{ seq: number } | null> {
    const row = await this.prisma.loa_sites.findUnique({
      where: { seq },
      select: { seq: true },
    });
    return row ? { seq: Number(row.seq) } : null;
  }

  /**
   * 특정 사이트(seq)의 최근 N일 일별 클릭수.
   * generate_series로 빈 날짜도 0으로 채워서 반환 (오래된→최신 순).
   */
  async findClickSeries(
    seq: number,
    days: number,
  ): Promise<Array<{ bucket: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string; count: bigint }>
    >`
      SELECT TO_CHAR(d.day, 'MM-DD') AS bucket,
             COUNT(c.id) AS count
      FROM generate_series(
             (CURRENT_DATE - ((${days}::int - 1) * INTERVAL '1 day'))::date,
             CURRENT_DATE,
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN loa_sites s ON s.seq = ${seq}
      LEFT JOIN apm_site_clicks c
        ON c.site_href = s.href AND DATE(c.created_at) = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
    return rows.map((r) => ({ bucket: r.bucket, count: Number(r.count) }));
  }

  /**
   * 최근 N일 동안 "한 사이트가 하루에 받은 최대 클릭수".
   * 모든 사이트 그래프의 Y축을 이 값으로 통일하면 사이트 간 인기 비교가 가능.
   */
  async findMaxDailyClicks(days: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ max_daily: bigint }>>`
      SELECT COALESCE(MAX(cnt), 0) AS max_daily
      FROM (
        SELECT site_href, DATE(created_at) AS d, COUNT(*) AS cnt
        FROM apm_site_clicks
        WHERE created_at >= (CURRENT_DATE - ((${days}::int - 1) * INTERVAL '1 day'))
        GROUP BY site_href, DATE(created_at)
      ) t
    `;
    return Number(rows[0]?.max_daily ?? 0);
  }

  async create(input: SiteCreateInput): Promise<number> {
    const created = await this.prisma.loa_sites.create({
      data: input,
      select: { seq: true },
    });
    return Number(created.seq);
  }

  async update(seq: number, input: SiteUpdateInput): Promise<void> {
    // 이름/URL 변경 시 클릭 로그(apm_site_clicks)도 동기화 — 기존 href로 매칭 후 갱신.
    // href가 바뀌어도 과거 클릭 이력이 새 URL에 그대로 연결되도록 함.
    if (input.name !== undefined || input.href !== undefined) {
      const current = await this.prisma.loa_sites.findUnique({
        where: { seq },
        select: { href: true },
      });
      if (current) {
        await this.prisma.$executeRaw`
          UPDATE apm_site_clicks
          SET site_name = COALESCE(${input.name ?? null}, site_name),
              site_href = COALESCE(${input.href ?? null}, site_href)
          WHERE site_href = ${current.href}
        `;
      }
    }
    await this.prisma.loa_sites.update({
      where: { seq },
      data: input,
    });
  }

  async updateText(
    seq: number,
    input: Pick<SiteCreateInput, 'name' | 'description'>,
  ): Promise<void> {
    if (input.name !== undefined) {
      const current = await this.prisma.loa_sites.findUnique({
        where: { seq },
        select: { href: true },
      });
      if (current) {
        await this.prisma.$executeRaw`
          UPDATE apm_site_clicks SET site_name = ${input.name}
          WHERE site_href = ${current.href}
        `;
      }
    }
    await this.prisma.loa_sites.update({
      where: { seq },
      data: input,
    });
  }

  async delete(seq: number): Promise<void> {
    await this.prisma.loa_sites.delete({ where: { seq } });
  }

  async findActiveForChecks(): Promise<SiteCheckRecord[]> {
    const rows = await this.prisma.loa_sites.findMany({
      where: { is_active: true },
      select: {
        seq: true,
        name: true,
        href: true,
        last_title: true,
        last_status: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      seq: Number(row.seq),
    }));
  }

  async updateCheckResult(
    seq: number,
    input: { last_title: string | null; last_status: number },
  ): Promise<void> {
    await this.prisma.loa_sites.update({
      where: { seq },
      data: {
        last_title: input.last_title,
        last_status: input.last_status,
        checked_at: new Date(),
      },
    });
  }
}
