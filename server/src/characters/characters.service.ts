import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DB_POOL } from '../db/db.module';

// 장비 스탯 수치(치명/특화/신속) 기반 빌드 분류
// 전체 합산 대비 비율 15% 이상이어야 해당 스탯을 "투자됨"으로 인정
// ex) 치명 1800 + 신속 600 + 특화 150 → 특화 비율 6.1% < 15% → 치신
// ex) 치명 800 + 신속 800 + 특화 800 → 각 33% ≥ 15% → 치특신
const STAT_RATIO_THRESHOLD = 0.15;

function classifyStatBuild(crit: number, spec: number, swift: number): string {
  const total = crit + spec + swift;
  if (total < 100) return '미설정';

  const hasCrit = crit / total >= STAT_RATIO_THRESHOLD;
  const hasSpec = spec / total >= STAT_RATIO_THRESHOLD;
  const hasSwift = swift / total >= STAT_RATIO_THRESHOLD;

  const count = [hasCrit, hasSpec, hasSwift].filter(Boolean).length;
  if (count === 0) return '미설정';
  if (count === 3) return '치특신';

  const pairMap: Record<string, string> = {
    'crit-swift': '치신',
    'swift-crit': '신치',
    'crit-spec': '치특',
    'spec-crit': '특치',
    'swift-spec': '신특',
    'spec-swift': '특신',
  };

  // 활성 스탯 2개: 수치 내림차순으로 키 조합
  const active = [
    { key: 'crit', val: crit, has: hasCrit },
    { key: 'spec', val: spec, has: hasSpec },
    { key: 'swift', val: swift, has: hasSwift },
  ]
    .filter((s) => s.has)
    .sort((a, b) => b.val - a.val);

  if (active.length >= 2) {
    return pairMap[`${active[0].key}-${active[1].key}`] ?? '미설정';
  }

  // 비율 기준 활성 스탯이 1개뿐 → 수치 2위 스탯과 페어
  const all = [
    { key: 'crit', val: crit },
    { key: 'spec', val: spec },
    { key: 'swift', val: swift },
  ].sort((a, b) => b.val - a.val);
  return pairMap[`${all[0].key}-${all[1].key}`] ?? '미설정';
}

@Injectable()
export class CharactersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findStatBuilds() {
    const [rows] = await (this.pool as any).execute(`
      SELECT
        c.class_detail    AS classDetail,
        c.class_engraving AS classEngraving,
        u.stat_crit       AS statCrit,
        u.stat_spec       AS statSpec,
        u.stat_swift      AS statSwift,
        u.level           AS level
      FROM loa_users u
      LEFT JOIN loa_class c ON u.class = c.idx
      WHERE (u.core_sun IS NOT NULL OR u.core_moon IS NOT NULL OR u.core_star IS NOT NULL)
        AND (u.stat_crit > 0 OR u.stat_spec > 0 OR u.stat_swift > 0)
    `);

    // 직업+코어+빌드타입 별로 집계
    const itemMap = new Map<
      string,
      {
        classDetail: string;
        classEngraving: string | null;
        statBuild: string;
        count: number;
        topLevel: number;
      }
    >();

    for (const r of rows as any[]) {
      const build = classifyStatBuild(r.statCrit, r.statSpec, r.statSwift);
      const key = `${r.classDetail}::${build}::${r.classEngraving ?? ''}`;
      const existing = itemMap.get(key);
      if (existing) {
        existing.count++;
        if (r.level > existing.topLevel) existing.topLevel = r.level;
      } else {
        itemMap.set(key, {
          classDetail: r.classDetail,
          classEngraving: r.classEngraving ?? null,
          statBuild: build,
          count: 1,
          topLevel: r.level,
        });
      }
    }

    // 탭별로 그룹핑 (빌드 종류 → 직업 목록)
    const TAB_ORDER = [
      '치신',
      '신치',
      '치특',
      '특치',
      '신특',
      '특신',
      '치특신',
    ];

    const tabMap = new Map<
      string,
      {
        statBuild: string;
        totalCount: number;
        items: {
          classDetail: string;
          classEngraving: string | null;
          count: number;
          topLevel: number;
        }[];
      }
    >();

    for (const entry of itemMap.values()) {
      const existing = tabMap.get(entry.statBuild);
      if (existing) {
        existing.items.push({
          classDetail: entry.classDetail,
          classEngraving: entry.classEngraving,
          count: entry.count,
          topLevel: entry.topLevel,
        });
        existing.totalCount += entry.count;
      } else {
        tabMap.set(entry.statBuild, {
          statBuild: entry.statBuild,
          totalCount: entry.count,
          items: [
            {
              classDetail: entry.classDetail,
              classEngraving: entry.classEngraving,
              count: entry.count,
              topLevel: entry.topLevel,
            },
          ],
        });
      }
    }

    return TAB_ORDER.map((t) => {
      const tab = tabMap.get(t);
      if (!tab) return { statBuild: t, totalCount: 0, items: [] };
      tab.items.sort((a, b) => b.count - a.count || b.topLevel - a.topLevel);
      return tab;
    });
  }
}
