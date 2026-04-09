import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DB_POOL } from '../db/db.module';
import { LostarkService } from '../lostark/lostark.service';

interface Sibling {
  ServerName: string;
  CharacterName: string;
  CharacterLevel: number;
  CharacterClassName: string;
  ItemAvgLevel: string;
}

interface ArmoryData {
  ArmoryProfile?: {
    CharacterName: string;
    ServerName: string;
    CharacterClassName: string;
    ItemAvgLevel: string;
    Stats?: { Type: string; Value: string }[];
  } | null;
  ArkPassive?: {
    IsArkPassive: boolean;
    Title: string | null;
    Points?: { Name: string; Value: number }[];
  } | null;
  ArkGrid?: {
    Slots: { Index: number; Name: string; Point: number }[];
  } | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly lostark: LostarkService,
  ) {}

  // loa_class 테이블에서 class_detail(직업명) + class_engraving(각인명)으로 idx 조회
  private async findClassIdx(
    charClassName: string,
    arkTitle: string | null,
  ): Promise<number | null> {
    const pool = this.pool as any;
    // ArkPassive.Title(각인명)이 있으면 class_detail + class_engraving으로 정확히 매칭
    if (arkTitle) {
      const [rows] = await pool.execute(
        'SELECT idx FROM loa_class WHERE class_detail = ? AND class_engraving = ? LIMIT 1',
        [charClassName, arkTitle],
      );
      if ((rows as any[]).length > 0) return (rows as any[])[0].idx;
    }
    // fallback: class_detail(직업명)만으로 첫 번째 행
    const [rows] = await pool.execute(
      'SELECT idx FROM loa_class WHERE class_detail = ? LIMIT 1',
      [charClassName],
    );
    return (rows as any[]).length > 0 ? (rows as any[])[0].idx : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const [rows] = await (this.pool as any).execute(
      'SELECT 1 FROM loa_users WHERE name = ? LIMIT 1',
      [name],
    );
    return (rows as any[]).length > 0;
  }

  async searchAndUpsert(characterName: string): Promise<{
    saved: number;
    expeditionKey: string;
    characters: {
      name: string;
      class: string;
      classDetail: string | null;
      classIdx: number | null;
      level: number;
      thesix: boolean;
    }[];
  }> {
    // 1. 원정대 전체 조회
    const siblings: Sibling[] = await this.lostark.fetchSiblings(characterName);
    if (!siblings || siblings.length === 0) {
      throw new Error(`캐릭터를 찾을 수 없습니다: ${characterName}`);
    }

    // 2. theSix 계산 (아이템레벨 상위 6명)
    const parseLevel = (s: string) => parseFloat((s || '0').replace(/,/g, ''));
    const sorted = [...siblings].sort(
      (a, b) => parseLevel(b.ItemAvgLevel) - parseLevel(a.ItemAvgLevel),
    );
    const theSixSet = new Set(sorted.slice(0, 6).map((s) => s.CharacterName));

    // 3. expedition_key = 서버:최고레벨캐릭터명
    const topChar = sorted[0];
    const expeditionKey = `${topChar.ServerName}:${topChar.CharacterName}`;

    // 4. 각 캐릭터 armories 조회 (순차 · rate-limited) → 버퍼에 누적
    type Row = {
      server: string;
      name: string;
      level: number;
      classIdx: number | null;
      thesix: number;
      expeditionKey: string;
      coreSun: number | null;
      coreMoon: number | null;
      coreStar: number | null;
      statCrit: number;
      statSpec: number;
      statSwift: number;
    };
    const results: {
      name: string;
      class: string;
      classDetail: string | null;
      classIdx: number | null;
      level: number;
      thesix: boolean;
    }[] = [];
    const buffer: Row[] = [];

    for (const sib of siblings) {
      let classDetail: string | null = null;
      let coreSun: number | null = null;
      let coreMoon: number | null = null;
      let coreStar: number | null = null;
      let statCrit = 0;
      let statSpec = 0;
      let statSwift = 0;
      try {
        // API 요청은 lostark.service의 직렬 큐 + rate limiter로 한 건씩 순차 전송
        const armory: ArmoryData | null = await this.lostark.fetchArmory(
          sib.CharacterName,
        );
        classDetail = armory?.ArkPassive?.Title ?? null;

        for (const st of armory?.ArmoryProfile?.Stats ?? []) {
          const v = parseInt(st.Value ?? '0', 10);
          if (st.Type === '치명') statCrit = v;
          else if (st.Type === '특화') statSpec = v;
          else if (st.Type === '신속') statSwift = v;
        }

        const slots: { Name: string }[] = armory?.ArkGrid?.Slots ?? [];
        for (const slot of slots) {
          if (!slot.Name) continue;
          const sep = ' 코어 : ';
          const sepIdx = slot.Name.indexOf(sep);
          const coreName =
            sepIdx >= 0 ? slot.Name.slice(sepIdx + sep.length) : slot.Name;
          const [rows] = (await (this.pool as any).execute(
            'SELECT seq, star FROM loa_ark_grid WHERE core = ? LIMIT 1',
            [coreName],
          )) as [any[], any];
          if (rows.length === 0) continue;
          const { seq, star } = rows[0];
          if (star === '질서의 해') coreSun = seq;
          else if (star === '질서의 달') coreMoon = seq;
          else if (star === '질서의 별') coreStar = seq;
        }
      } catch {
        // 비공개 or API 에러 → null로 처리
      }

      const level = parseLevel(sib.ItemAvgLevel);
      const thesix = theSixSet.has(sib.CharacterName) ? 1 : 0;
      const classIdx = await this.findClassIdx(
        sib.CharacterClassName,
        classDetail,
      );

      // DB 저장은 버퍼에 쌓아두고 나중에 한 번에 처리
      buffer.push({
        server: sib.ServerName,
        name: sib.CharacterName,
        level,
        classIdx,
        thesix,
        expeditionKey,
        coreSun,
        coreMoon,
        coreStar,
        statCrit,
        statSpec,
        statSwift,
      });

      results.push({
        name: sib.CharacterName,
        class: sib.CharacterClassName,
        classDetail,
        classIdx,
        level,
        thesix: thesix === 1,
      });
    }

    // 5. 원정대 전체를 단일 배치 INSERT (N번 → 1번)
    if (buffer.length > 0) {
      const placeholders = buffer
        .map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)')
        .join(',');
      const params = buffer.flatMap((r) => [
        r.server,
        r.name,
        r.level,
        r.classIdx,
        r.thesix,
        r.expeditionKey,
        r.coreSun,
        r.coreMoon,
        r.coreStar,
        r.statCrit,
        r.statSpec,
        r.statSwift,
      ]);
      await (this.pool as any).execute(
        `INSERT INTO loa_users
           (server, name, level, class, thesix, expedition_key,
            core_sun, core_moon, core_star, stat_crit, stat_spec, stat_swift)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           level          = VALUES(level),
           class          = VALUES(class),
           thesix         = VALUES(thesix),
           expedition_key = VALUES(expedition_key),
           core_sun       = COALESCE(VALUES(core_sun),  core_sun),
           core_moon      = COALESCE(VALUES(core_moon), core_moon),
           core_star      = COALESCE(VALUES(core_star), core_star),
           stat_crit      = COALESCE(NULLIF(VALUES(stat_crit),  0), stat_crit),
           stat_spec      = COALESCE(NULLIF(VALUES(stat_spec),  0), stat_spec),
           stat_swift     = COALESCE(NULLIF(VALUES(stat_swift), 0), stat_swift)`,
        params,
      );
    }

    return { saved: results.length, expeditionKey, characters: results };
  }

  async getStats(): Promise<{
    total: number;
    byClass: { classRoot: string; count: number; avgLevel: number }[];
    byServer: { server: string; count: number }[];
    byClassDetail: { classDetail: string; count: number }[];
    theSixRate: { classRoot: string; theSixCount: number; total: number }[];
  }> {
    const pool = this.pool as any;

    const [[{ total }]] = await pool.execute(
      'SELECT COUNT(*) as total FROM loa_users',
    );

    // loa_class JOIN으로 직업명(class_root) 기준 통계
    const [byClass] = await pool.execute(
      `SELECT c.class_root as classRoot, COUNT(*) as count, ROUND(AVG(u.level), 2) as avgLevel
       FROM loa_users u
       LEFT JOIN loa_class c ON u.class = c.idx
       GROUP BY c.class_root ORDER BY count DESC`,
    );

    const [byServer] = await pool.execute(
      `SELECT server, COUNT(*) as count
       FROM loa_users GROUP BY server ORDER BY count DESC`,
    );

    const [byClassDetail] = await pool.execute(
      `SELECT COALESCE(c.class_detail, '미확인') as classDetail, COUNT(*) as count
       FROM loa_users u
       LEFT JOIN loa_class c ON u.class = c.idx
       GROUP BY c.class_detail ORDER BY count DESC`,
    );

    const [theSixRate] = await pool.execute(
      `SELECT c.class_root as classRoot,
              SUM(u.thesix) as theSixCount,
              COUNT(*) as total
       FROM loa_users u
       LEFT JOIN loa_class c ON u.class = c.idx
       GROUP BY c.class_root ORDER BY theSixCount DESC`,
    );

    return { total, byClass, byServer, byClassDetail, theSixRate };
  }
}
