import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type Redis from 'ioredis';
import { DB_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';

export type AdminRole = 'master' | 'guest';

export interface AdminSessionPayload {
  sub: number;
  username: string;
  role: AdminRole;
}

interface AdminUserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  role: AdminRole;
}

const SESSION_TTL = 60 * 60 * 8; // 8시간
const SESSION_PREFIX = 'admin:session:';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureTable();
    try {
      await this.seedAccounts();
    } catch (err: unknown) {
      this.logger.error(
        `관리자 계정 시딩 실패 (서버는 정상 기동): ${String(err)}`,
      );
    }
  }

  private async ensureTable() {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(50)  NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role          ENUM('master','guest') NOT NULL DEFAULT 'guest',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  }

  private async seedAccounts() {
    const ownerPw = this.config.get<string>('ADMIN_OWNER_PASSWORD');
    const demoPw = this.config.get<string>('ADMIN_DEMO_PASSWORD');

    if (!ownerPw || !demoPw) {
      this.logger.warn(
        'ADMIN_OWNER_PASSWORD 또는 ADMIN_DEMO_PASSWORD 미설정 — 관리자 계정 시딩 스킵',
      );
      return;
    }

    await this.upsertAccount('master', ownerPw, 'master');
    await this.upsertAccount('guest', demoPw, 'guest');
    this.logger.log('관리자 계정 시딩 완료');
  }

  private async upsertAccount(
    username: string,
    plainPassword: string,
    role: AdminRole,
  ) {
    const [rows] = await this.pool.execute<AdminUserRow[]>(
      'SELECT id FROM admin_users WHERE username = ? LIMIT 1',
      [username],
    );
    if (rows[0]) return; // 이미 존재하면 스킵

    const hash = await bcrypt.hash(plainPassword, 12);
    await this.pool.execute(
      'INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, hash, role],
    );
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ sessionId: string; role: AdminRole }> {
    const [rows] = await this.pool.execute<AdminUserRow[]>(
      'SELECT id, username, password_hash, role FROM admin_users WHERE username = ? LIMIT 1',
      [username],
    );
    const user = rows[0];

    if (!user) throw new UnauthorizedException('인증 실패');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('인증 실패');

    const sessionId = crypto.randomUUID();
    const payload: AdminSessionPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    await this.redis.set(
      `${SESSION_PREFIX}${sessionId}`,
      JSON.stringify(payload),
      'EX',
      SESSION_TTL,
    );
    return { sessionId, role: user.role };
  }

  async verifySession(sessionId: string): Promise<AdminSessionPayload | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSessionPayload;
  }

  async logout(sessionId: string): Promise<void> {
    await this.redis.del(`${SESSION_PREFIX}${sessionId}`);
  }
}
