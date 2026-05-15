import {
  Controller,
  Post,
  Param,
  Body,
  Sse,
  Query,
  UseGuards,
  BadRequestException,
  Inject,
  MessageEvent,
} from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { DB_POOL } from '../db/db.module';
import { AdminGuard, AdminWriteGuard, RequireOwner } from './admin.guard';

type TableKey = 'users' | 'sites';

interface TableSpec {
  table: string;
  columns: readonly string[];
}

const TABLE_SPECS: Record<TableKey, TableSpec> = {
  users: {
    table: 'loa_users',
    columns: [
      'seq',
      'server',
      'level',
      'combat_power',
      'class',
      'thesix',
      'name',
      'expedition_key',
      'core_sun',
      'core_moon',
      'core_star',
      'stat_crit',
      'stat_spec',
      'stat_swift',
      'stat_build',
    ],
  },
  sites: {
    table: 'loa_sites',
    columns: [
      'seq',
      'name',
      'href',
      'category',
      'description',
      'icon',
      'is_active',
      'last_title',
      'last_status',
      'checked_at',
    ],
  },
};

const CHUNK_SIZE = 1000;

function specOrThrow(table: string): TableSpec {
  if (!(table in TABLE_SPECS)) {
    throw new BadRequestException(`지원하지 않는 테이블: ${table}`);
  }
  return TABLE_SPECS[table as TableKey];
}

@Controller('api/admin/sync')
@UseGuards(AdminGuard)
export class AdminSyncController {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  /** target 측: 동기화 시작 - TRUNCATE */
  @Post(':table/begin')
  @UseGuards(AdminWriteGuard)
  @RequireOwner()
  async begin(@Param('table') table: string) {
    const spec = specOrThrow(table);
    const conn = await this.pool.getConnection();
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      await conn.query(`TRUNCATE TABLE \`${spec.table}\``);
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
    } finally {
      conn.release();
    }
    return { ok: true, table: spec.table };
  }

  /** target 측: 행 청크 bulk INSERT */
  @Post(':table/chunk')
  @UseGuards(AdminWriteGuard)
  @RequireOwner()
  async chunk(
    @Param('table') table: string,
    @Body() body: { rows?: unknown[][] },
  ) {
    const spec = specOrThrow(table);
    const rows = body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { inserted: 0 };
    }
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== spec.columns.length) {
        throw new BadRequestException(
          `행 길이가 컬럼 수와 다릅니다 (expected=${spec.columns.length})`,
        );
      }
    }

    const colList = spec.columns.map((c) => `\`${c}\``).join(', ');
    const conn = await this.pool.getConnection();
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO \`${spec.table}\` (${colList}) VALUES ?`,
        [rows],
      );
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
      return { inserted: result.affectedRows };
    } finally {
      conn.release();
    }
  }

  /** source/orchestrator 측: 로컬 DB → 원격 target API로 SSE 진행률 스트림 */
  @Sse(':table/run')
  @RequireOwner()
  run(
    @Param('table') table: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    const spec = specOrThrow(table);
    const targetUrl = this.config.get<string>('SYNC_TARGET_API_URL', '').trim();
    const targetPassword = this.config
      .get<string>('SYNC_TARGET_ADMIN_PASSWORD', '')
      .trim();

    return new Observable<MessageEvent>((subscriber) => {
      let cancelled = false;

      const emit = (
        type: 'progress' | 'done' | 'error',
        data: Record<string, unknown>,
      ) => {
        subscriber.next({ type, data: JSON.stringify(data) });
      };

      void (async () => {
        try {
          if (!targetUrl || !targetPassword) {
            throw new Error(
              'SYNC_TARGET_API_URL / SYNC_TARGET_ADMIN_PASSWORD 환경변수가 설정되지 않았습니다',
            );
          }
          if (sessionId && sessionId !== '') {
            // session id is already validated by guard; we keep param for future use
          }

          // 0) target에 master 계정으로 로그인하여 sessionId 획득
          emit('progress', {
            phase: 'login',
            message: '원격 서버 로그인 중...',
            percent: 0,
          });
          const loginRes = (await callTargetRaw(
            targetUrl,
            '/api/admin/auth/login',
            '',
            { username: 'master', password: targetPassword },
          )) as { sessionId?: string };
          const remoteToken = loginRes?.sessionId ?? '';
          if (!remoteToken) {
            throw new Error('원격 로그인 실패: sessionId 없음');
          }

          // 1) target 측 begin (TRUNCATE)
          emit('progress', {
            phase: 'begin',
            message: `${spec.table} TRUNCATE 중...`,
            percent: 0,
          });
          await callTargetRaw(
            targetUrl,
            `/api/admin/sync/${table}/begin`,
            remoteToken,
            {},
          );

          // 2) total count
          const [countRows] = await this.pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM \`${spec.table}\``,
          );
          const total = Number(countRows[0]?.total ?? 0);
          emit('progress', {
            phase: 'count',
            total,
            transferred: 0,
            percent: total === 0 ? 100 : 0,
          });

          if (total === 0) {
            emit('done', { total: 0, transferred: 0 });
            subscriber.complete();
            return;
          }

          // 3) chunked read + push
          const colList = spec.columns.map((c) => `\`${c}\``).join(', ');
          let transferred = 0;
          let lastSeq = 0;

          while (!cancelled) {
            const [chunkRows] = await this.pool.query<RowDataPacket[]>(
              `SELECT ${colList} FROM \`${spec.table}\` WHERE seq > ${lastSeq} ORDER BY seq ASC LIMIT ${CHUNK_SIZE}`,
            );
            if (chunkRows.length === 0) break;

            const values = chunkRows.map((r) =>
              spec.columns.map((c) => normalize(r[c])),
            );

            const last = chunkRows[chunkRows.length - 1];
            lastSeq = Number(last.seq);

            const res = await callTargetRaw(
              targetUrl,
              `/api/admin/sync/${table}/chunk`,
              remoteToken,
              { rows: values },
            );
            const inserted = Number(
              (res as { inserted?: number })?.inserted ?? 0,
            );
            transferred += inserted;

            emit('progress', {
              phase: 'chunk',
              total,
              transferred,
              percent: Math.min(99, Math.floor((transferred / total) * 100)),
              lastSeq,
            });
          }

          if (cancelled) {
            emit('error', { message: '취소됨' });
            subscriber.complete();
            return;
          }

          emit('done', { total, transferred, percent: 100 });
          subscriber.complete();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          emit('error', { message: msg });
          subscriber.complete();
        }
      })();

      return () => {
        cancelled = true;
      };
    });
  }
}

function normalize(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) {
    // mysql2는 DATETIME을 Date 객체로 반환. ISO 대신 'YYYY-MM-DD HH:mm:ss' 사용
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  return v;
}

async function callTargetRaw(
  baseUrl: string,
  path: string,
  token: string,
  body: unknown,
): Promise<unknown> {
  const url = baseUrl.replace(/\/$/, '') + path;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['x-admin-session'] = token;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `target ${path} 실패 (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}
