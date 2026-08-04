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
import { SiteSuggestService } from '../inven/site-suggest.service';

/** 입력 URL에서 호스트명을 뽑는다. 잘못된 URL이면 400. */
function parseDomain(url: string | undefined): { url: string; domain: string } {
  const trimmed = (url ?? '').trim();
  if (!trimmed) throw new BadRequestException('url은 필수입니다');
  try {
    return { url: trimmed, domain: new URL(trimmed).hostname };
  } catch {
    throw new BadRequestException('url 형식이 올바르지 않습니다');
  }
}

@Controller('api/admin/sites')
@UseGuards(AdminGuard)
export class AdminSitesController {
  constructor(
    private readonly sitesRepo: SitesRepository,
    private readonly sitesService: SitesService,
    private readonly suggestService: SiteSuggestService,
  ) {}

  /** 사이트 카테고리 고정 목록 — 서버 단일 정본(site-categories.ts). */
  @Get('categories')
  getCategories() {
    return { categories: SITE_CATEGORIES };
  }

  /**
   * URL만으로 name·icon을 가져온다 (AI 호출 없음 — 페이지 제목 앞부분 / favicon).
   * 인벤 후보는 후보 id로 같은 일을 하지만, 사이트 관리는 후보가 없어 URL을 직접 받는다.
   * 라우트 순서 주의: ':seq/click-series' 보다 앞에 있어야 파라미터로 먹히지 않는다.
   */
  @Get('meta')
  async fetchMeta(@Query('url') url?: string) {
    return this.suggestService.fetchNameAndIcon(parseDomain(url));
  }

  /**
   * URL에 대해 AI로 category·description을 추천받는다.
   * 버튼 클릭 시에만 호출됨(자동 실행 없음) — 토큰 보호. master 전용.
   */
  @Post('suggest')
  @UseGuards(AdminWriteGuard)
  async suggest(@Body() body: { url?: string }) {
    return this.suggestService.suggest(parseDomain(body?.url));
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
