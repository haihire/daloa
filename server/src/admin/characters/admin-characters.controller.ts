import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { classifyStatBuild } from '../../characters/characters.service';
import { AdminCharactersRepository } from './admin-characters.repository';
import { AdminGuard } from '../auth/admin.guard';

@Controller('api/admin/characters')
@UseGuards(AdminGuard)
export class AdminCharactersController {
  constructor(
    private readonly adminCharactersRepo: AdminCharactersRepository,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('search') search = '',
    @Query('statBuild') statBuildFilter = '',
    @Query('classDetail') classDetailFilter = '',
  ) {
    const limit = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const filters = {
      search,
      statBuild: statBuildFilter,
      classDetail: classDetailFilter,
    };
    const offset = (pageNum - 1) * limit;

    const [total, rows] = await Promise.all([
      this.adminCharactersRepo.count(filters),
      this.adminCharactersRepo.findPage({ ...filters, limit, offset }),
    ]);

    const items = rows.map((r) => ({
      name: r.name,
      server: r.server,
      level: r.level,
      combatPower: r.combatPower ?? null,
      classDetail: r.classDetail,
      classEngraving: r.classEngraving,
      statCrit: r.statCrit,
      statSpec: r.statSpec,
      statSwift: r.statSwift,
      statBuild:
        r.statBuild && r.statBuild.length > 0
          ? r.statBuild
          : classifyStatBuild(r.statCrit, r.statSpec, r.statSwift),
      thesix: r.thesix === 1,
      coreSun: r.coreSun ?? null,
      coreMoon: r.coreMoon ?? null,
      coreStar: r.coreStar ?? null,
    }));

    return { total, page: pageNum, pageSize: limit, items };
  }
}
