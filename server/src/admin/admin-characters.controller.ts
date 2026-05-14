import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { DB_POOL } from '../db/db.module';
import { AdminGuard } from './admin.guard';
import { classifyStatBuild } from '../characters/characters.service';

interface CharacterRow extends RowDataPacket {
  name: string;
  server: string;
  level: number;
  combatPower: number | null;
  classDetail: string | null;
  classEngraving: string | null;
  statCrit: number;
  statSpec: number;
  statSwift: number;
  thesix: number;
  coreSun: string | null;
  coreMoon: string | null;
  coreStar: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

@Controller('api/admin/characters')
@UseGuards(AdminGuard)
export class AdminCharactersController {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('search') search = '',
    @Query('statBuild') statBuildFilter = '',
    @Query('classDetail') classDetailFilter = '',
  ) {
    const limit = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      conditions.push('u.name LIKE ?');
      params.push(`%${search}%`);
    }
    if (classDetailFilter) {
      conditions.push('c.class_detail = ?');
      params.push(classDetailFilter);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await this.pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM loa_users u
       LEFT JOIN loa_class c ON u.class = c.idx
       ${where}`,
      params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await this.pool.execute<CharacterRow[]>(
      `SELECT
         u.name,
         u.server,
         u.level,
         u.combat_power    AS combatPower,
         c.class_detail    AS classDetail,
         c.class_engraving AS classEngraving,
         u.stat_crit       AS statCrit,
         u.stat_spec       AS statSpec,
         u.stat_swift      AS statSwift,
         u.thesix,
         ag_sun.core       AS coreSun,
         ag_moon.core      AS coreMoon,
         ag_star.core      AS coreStar
       FROM loa_users u
       LEFT JOIN loa_class    c       ON u.class      = c.idx
       LEFT JOIN loa_ark_grid ag_sun  ON u.core_sun   = ag_sun.seq
       LEFT JOIN loa_ark_grid ag_moon ON u.core_moon  = ag_moon.seq
       LEFT JOIN loa_ark_grid ag_star ON u.core_star  = ag_star.seq
       ${where}
       ORDER BY u.level DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    let items = rows.map((r) => ({
      name: r.name,
      server: r.server,
      level: r.level,
      combatPower: r.combatPower ?? null,
      classDetail: r.classDetail,
      classEngraving: r.classEngraving,
      statCrit: r.statCrit,
      statSpec: r.statSpec,
      statSwift: r.statSwift,
      statBuild: classifyStatBuild(r.statCrit, r.statSpec, r.statSwift),
      thesix: r.thesix === 1,
      coreSun: r.coreSun ?? null,
      coreMoon: r.coreMoon ?? null,
      coreStar: r.coreStar ?? null,
    }));

    // statBuild 필터는 JS에서 적용 (classifyStatBuild 결과 기반)
    if (statBuildFilter) {
      items = items.filter((i) => i.statBuild === statBuildFilter);
    }

    return { total, page: parseInt(page, 10) || 1, pageSize: limit, items };
  }
}
