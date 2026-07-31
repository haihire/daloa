import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { AdminAuthRepository, type AdminRole } from './admin-auth.repository';

export type { AdminRole };

export interface AdminSessionPayload {
  sub: number;
  username: string;
  role: AdminRole;
}

// 클라이언트 쿠키 수명(client login route: 60*60*8)과 반드시 일치시킬 것.
// 세션이 쿠키보다 먼저 죽으면 "로그인된 채로 write만 세션 없음" 증상이 난다.
const SESSION_TTL = 60 * 60 * 8;
const SESSION_PREFIX = 'admin:session:';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly adminAuthRepo: AdminAuthRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.adminAuthRepo.ensureTable();
    try {
      await this.seedAccounts();
    } catch (err: unknown) {
      this.logger.error(`Admin account seed failed: ${String(err)}`);
    }
  }

  private async seedAccounts() {
    const ownerPw = this.config.get<string>('ADMIN_OWNER_PASSWORD');
    const demoPw = this.config.get<string>('ADMIN_DEMO_PASSWORD');

    if (!ownerPw || !demoPw) {
      this.logger.warn(
        'ADMIN_OWNER_PASSWORD or ADMIN_DEMO_PASSWORD is missing. Skip admin seed.',
      );
      return;
    }

    await this.upsertAccount('master', ownerPw, 'master');
    await this.upsertAccount('guest', demoPw, 'guest');
    this.logger.log('Admin accounts are ready');
  }

  private async upsertAccount(
    username: string,
    plainPassword: string,
    role: AdminRole,
  ) {
    const existing = await this.adminAuthRepo.findByUsername(username);
    if (existing) return;

    const hash = await bcrypt.hash(plainPassword, 12);
    await this.adminAuthRepo.createAccount(username, hash, role);
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ sessionId: string; role: AdminRole }> {
    const user = await this.adminAuthRepo.findByUsername(username);

    if (!user) throw new UnauthorizedException('Authentication failed');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Authentication failed');

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
    const key = `${SESSION_PREFIX}${sessionId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    // 슬라이딩 만료: 활동이 있을 때마다 TTL을 갱신해 활성 사용자가
    // 도중에 로그아웃되지 않도록 한다.
    await this.redis.expire(key, SESSION_TTL);
    return JSON.parse(raw) as AdminSessionPayload;
  }

  async logout(sessionId: string): Promise<void> {
    await this.redis.del(`${SESSION_PREFIX}${sessionId}`);
  }
}
