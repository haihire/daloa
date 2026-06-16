import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StatBuildRow {
  classDetail: string;
  classEngraving: string | null;
  statCrit: number;
  statSpec: number;
  statSwift: number;
}

@Injectable()
export class CharactersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStatBuildRows(): Promise<StatBuildRow[]> {
    return this.prisma.$queryRaw<StatBuildRow[]>`
      SELECT
        c.class_detail    AS "classDetail",
        c.class_engraving AS "classEngraving",
        u.stat_crit       AS "statCrit",
        u.stat_spec       AS "statSpec",
        u.stat_swift      AS "statSwift"
      FROM loa_users u
      LEFT JOIN loa_class c ON u.class = c.idx
      WHERE (u.core_sun IS NOT NULL OR u.core_moon IS NOT NULL OR u.core_star IS NOT NULL)
        AND (u.stat_crit > 0 OR u.stat_spec > 0 OR u.stat_swift > 0)
    `;
  }
}
