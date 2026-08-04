import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SitesRepository } from '../../sites/sites.repository';
import { SitesService } from '../../sites/sites.service';
import { AdminGuard, AdminWriteGuard } from '../auth/admin.guard';
import { SITE_CATEGORIES } from '../site-categories';

@Controller('api/admin/sites')
@UseGuards(AdminGuard)
export class AdminSitesController {
  constructor(
    private readonly sitesRepo: SitesRepository,
    private readonly sitesService: SitesService,
  ) {}

  /** 사이트 카테고리 고정 목록 — 서버 단일 정본(site-categories.ts). */
  @Get('categories')
  getCategories() {
    return { categories: SITE_CATEGORIES };
  }

  @Get()
  async findAll() {
    return this.sitesRepo.findAdminAll();
  }

  /** 특정 사이트의 최근 N일(기본 7) 일별 클릭 추이 */
  @Get(':seq/click-series')
  async clickSeries(
    @Param('seq', ParseIntPipe) seq: number,
    @Query('days') days?: string,
  ) {
    const parsed = days ? parseInt(days, 10) : 7;
    const n = Number.isNaN(parsed) ? 7 : Math.max(1, Math.min(30, parsed));
    const [series, yMax] = await Promise.all([
      this.sitesRepo.findClickSeries(seq, n),
      this.sitesRepo.findMaxDailyClicks(n),
    ]);
    return { series, yMax };
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
      throw new BadRequestException('name and href are required');
    }

    const seq = await this.sitesRepo.create({
      name: body.name,
      href: body.href,
      category: body.category ?? null,
      description: body.description ?? null,
      icon: body.icon ?? null,
    });
    await this.sitesService.invalidateCache();
    return { seq };
  }

  @Put(':id')
  @UseGuards(AdminWriteGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      href?: string;
      category?: string | null;
      description?: string | null;
      icon?: string | null;
      is_active?: boolean;
    },
  ) {
    const site = await this.sitesRepo.findBySeq(id);
    if (!site) throw new NotFoundException('Site not found');

    const values: {
      name?: string;
      href?: string;
      category?: string | null;
      description?: string | null;
      icon?: string | null;
      is_active?: boolean;
    } = {};

    if (body.name !== undefined) values.name = body.name;
    if (body.href !== undefined) values.href = body.href;
    if (body.category !== undefined) values.category = body.category;
    if (body.description !== undefined) values.description = body.description;
    if (body.icon !== undefined) values.icon = body.icon;
    if (body.is_active !== undefined) values.is_active = body.is_active;

    if (Object.keys(values).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    await this.sitesRepo.update(id, values);
    await this.sitesService.invalidateCache();
    return { ok: true };
  }

  @Delete(':id')
  @UseGuards(AdminWriteGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const site = await this.sitesRepo.findBySeq(id);
    if (!site) throw new NotFoundException('Site not found');

    await this.sitesRepo.delete(id);
    await this.sitesService.invalidateCache();
    return { ok: true };
  }
}
