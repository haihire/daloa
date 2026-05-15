import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { DB_POOL } from '../db/db.module';
import { AdminGuard, AdminWriteGuard } from './admin.guard';
import { SitesService } from '../sites/sites.service';

interface SiteRow extends RowDataPacket {
  seq: number;
  name: string;
  href: string;
  category: string | null;
  description: string | null;
  icon: string | null;
  is_active: number;
}

@Controller('api/admin/sites')
@UseGuards(AdminGuard)
export class AdminSitesController {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly sitesService: SitesService,
  ) {}

  @Get()
  async findAll() {
    const [rows] = await this.pool.execute<SiteRow[]>(
      'SELECT seq, name, href, category, description, icon, is_active FROM loa_sites ORDER BY seq',
    );
    return rows;
  }

  @Post()
  @UseGuards(AdminWriteGuard)
  async create(
    @Body()
    body: {
      name?: string;
      href?: string;
      category?: string;
      description?: string;
      icon?: string;
    },
  ) {
    if (!body.name || !body.href) {
      throw new BadRequestException('name과 href는 필수입니다');
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO loa_sites (name, href, category, description, icon) VALUES (?, ?, ?, ?, ?)',
      [
        body.name,
        body.href,
        body.category ?? null,
        body.description ?? null,
        body.icon ?? null,
      ],
    );
    await this.sitesService.invalidateCache();
    return { seq: result.insertId };
  }

  @Put(':id')
  @UseGuards(AdminWriteGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      href?: string;
      category?: string;
      description?: string;
      icon?: string;
      is_active?: boolean;
    },
  ) {
    const [rows] = await this.pool.execute<SiteRow[]>(
      'SELECT seq FROM loa_sites WHERE seq = ?',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('사이트를 찾을 수 없습니다');

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      fields.push('name = ?');
      values.push(body.name);
    }
    if (body.href !== undefined) {
      fields.push('href = ?');
      values.push(body.href);
    }
    if (body.category !== undefined) {
      fields.push('category = ?');
      values.push(body.category);
    }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description);
    }
    if (body.icon !== undefined) {
      fields.push('icon = ?');
      values.push(body.icon);
    }
    if (body.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }

    if (fields.length === 0)
      throw new BadRequestException('변경할 필드가 없습니다');

    values.push(id);
    await this.pool.execute<ResultSetHeader>(
      `UPDATE loa_sites SET ${fields.join(', ')} WHERE seq = ?`,
      values as (string | number | boolean | null)[],
    );
    await this.sitesService.invalidateCache();
    return { ok: true };
  }

  @Delete(':id')
  @UseGuards(AdminWriteGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const [rows] = await this.pool.execute<SiteRow[]>(
      'SELECT seq FROM loa_sites WHERE seq = ?',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('사이트를 찾을 수 없습니다');

    await this.pool.execute('DELETE FROM loa_sites WHERE seq = ?', [id]);
    await this.sitesService.invalidateCache();
    return { ok: true };
  }
}
