import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { DB_POOL } from '../db/db.module';

export type AdminRole = 'master' | 'guest';

export interface AdminJwtPayload {
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

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureTable();
    await this.seedAccounts();
  }

  private async ensureTable() {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(50)  NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role          ENUM('owner','demo') NOT NULL DEFAULT 'demo',
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
  ): Promise<{ accessToken: string; role: AdminRole }> {
    const [rows] = await this.pool.execute<AdminUserRow[]>(
      'SELECT id, username, password_hash, role FROM admin_users WHERE username = ? LIMIT 1',
      [username],
    );
    const user = rows[0];

    if (!user) throw new UnauthorizedException('인증 실패');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('인증 실패');

    const payload: AdminJwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, role: user.role };
  }

  verifyToken(token: string): AdminJwtPayload {
    return this.jwtService.verify<AdminJwtPayload>(token);
  }
}
