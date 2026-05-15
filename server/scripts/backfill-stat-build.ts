/**
 * loa_users.stat_build 백필 스크립트
 *
 * 사용:
 *   cd server
 *   npx ts-node scripts/backfill-stat-build.ts
 *
 * - stat_build 컬럼이 NULL/빈 문자열인 행만 처리
 * - classifyStatBuild 와 동일 로직으로 분류
 * - 1,000 행씩 배치 UPDATE
 */
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { classifyStatBuild } from '../src/characters/characters.service';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

interface Row {
  seq: number;
  stat_crit: number;
  stat_spec: number;
  stat_swift: number;
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'lost_ark',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 4,
    timezone: '+09:00',
  });

  const BATCH = 1000;
  let processed = 0;

  while (true) {
    // Use pool.query (not execute) for the LIMIT placeholder because some
    // MySQL/MariaDB versions reject integer parameters in prepared LIMIT clauses
    // ("Incorrect arguments to mysqld_stmt_execute"). BATCH is a hardcoded
    // integer constant so inlining it is safe.
    const [rows] = await pool.query<(Row & mysql.RowDataPacket)[]>(
      `SELECT seq, stat_crit, stat_spec, stat_swift
         FROM loa_users
        WHERE stat_build IS NULL OR stat_build = ''
        LIMIT ${BATCH}`,
    );
    if (rows.length === 0) break;

    // 배치 전체를 CASE 문으로 한 번의 쿼리로 업데이트 (라운드트립 1회)
    const caseClause = rows.map(() => 'WHEN ? THEN ?').join(' ');
    const inClause = rows.map(() => '?').join(',');
    const params: (number | string)[] = [];
    for (const r of rows) {
      params.push(
        r.seq,
        classifyStatBuild(r.stat_crit, r.stat_spec, r.stat_swift),
      );
    }
    const seqParams = rows.map((r) => r.seq);
    await pool.execute(
      `UPDATE loa_users SET stat_build = CASE seq ${caseClause} END WHERE seq IN (${inClause})`,
      [...params, ...seqParams],
    );
    processed += rows.length;
    console.log(`backfilled: ${processed}`);
    if (rows.length < BATCH) break;
  }

  await pool.end();
  console.log(`done. total=${processed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
