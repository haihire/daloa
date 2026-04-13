import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DB_POOL } from '../db/db.module';

// 장비 스탯 수치(치명/특화/신속) 기반 빌드 분류
// 전체 합산 대비 비율 15% 이상이어야 해당 스탯을 "투자됨"으로 인정
// ex) 치명 1800 + 신속 600 + 특화 150 → 특화 비율 6.1% < 15% → 치신 / 합산 < 300이면 미설정
// ex) 치명 800 + 신속 800 + 특화 800 → 각 33% ≥ 15% → 치특신
const STAT_RATIO_THRESHOLD = 0.15;

function classifyStatBuild(crit: number, spec: number, swift: number): string {
  const total = crit + spec + swift;
  if (total < 300) return '미설정';

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

    // Step 1: 직업+각인+빌드타입 별로 각각 집계
    const rawMap = new Map<
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
      const key = `${r.classDetail}\x00${r.classEngraving ?? ''}\x00${build}`;
      const existing = rawMap.get(key);
      if (existing) {
        existing.count++;
        if (r.level > existing.topLevel) existing.topLevel = r.level;
      } else {
        rawMap.set(key, {
          classDetail: r.classDetail,
          classEngraving: r.classEngraving ?? null,
          statBuild: build,
          count: 1,
          topLevel: r.level,
        });
      }
    }

    // Step 2: 직업+각인 단위로 빌드별 카운트 집계
    //   → 미설정은 대표 빌드 결정에서 제외 (유효 빌드만 비교)
    const ceMap = new Map<
      string,
      {
        classDetail: string;
        classEngraving: string | null;
        buildCounts: Map<string, { count: number; topLevel: number }>;
      }
    >();

    for (const entry of rawMap.values()) {
      const ceKey = `${entry.classDetail}\x00${entry.classEngraving ?? ''}`;
      if (!ceMap.has(ceKey)) {
        ceMap.set(ceKey, {
          classDetail: entry.classDetail,
          classEngraving: entry.classEngraving,
          buildCounts: new Map(),
        });
      }
      const ce = ceMap.get(ceKey)!;
      const prev = ce.buildCounts.get(entry.statBuild);
      if (prev) {
        prev.count += entry.count;
        if (entry.topLevel > prev.topLevel) prev.topLevel = entry.topLevel;
      } else {
        ce.buildCounts.set(entry.statBuild, {
          count: entry.count,
          topLevel: entry.topLevel,
        });
      }
    }

    // Step 3: 각 직업+각인의 "대표 빌드"(미설정 제외 최다) 로 전체 카운트 합산
    //   → 예) 업화의 계승자 특치 70명 + 신치 30명 → 대표 빌드 특치로 100명 표시
    const mergedItems: {
      classDetail: string;
      classEngraving: string | null;
      statBuild: string;
      count: number;
      topLevel: number;
    }[] = [];

    for (const ce of ceMap.values()) {
      let dominantBuild = '';
      let maxCount = 0;
      let totalCount = 0;
      let maxTopLevel = 0;

      for (const [build, { count, topLevel }] of ce.buildCounts.entries()) {
        if (topLevel > maxTopLevel) maxTopLevel = topLevel;
        // 미설정은 총합에도 포함하지 않음
        if (build === '미설정') continue;
        totalCount += count;
        if (count > maxCount) {
          maxCount = count;
          dominantBuild = build;
        }
      }

      if (dominantBuild && totalCount > 0) {
        mergedItems.push({
          classDetail: ce.classDetail,
          classEngraving: ce.classEngraving,
          statBuild: dominantBuild,
          count: totalCount,
          topLevel: maxTopLevel,
        });
      }
    }

    // Step 4: 탭별로 그룹핑 (빌드 종류 → 직업 목록)
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

    for (const entry of mergedItems) {
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
