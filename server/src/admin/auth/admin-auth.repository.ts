import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type AdminRole = 'master' | 'guest';

export interface AdminUserRecord {
  id: number;
  username: string;
  password_hash: string;
  role: AdminRole;
}

function toAdminRole(value: string): AdminRole {
  return value === 'master' ? 'master' : 'guest';
}

@Injectable()
export class AdminAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_users_role') THEN
          CREATE TYPE admin_users_role AS ENUM ('master', 'guest');
        END IF;
      END
      $$;
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role admin_users_role NOT NULL DEFAULT 'guest',
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async findByUsername(username: string): Promise<AdminUserRecord | null> {
    const user = await this.prisma.admin_users.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password_hash: true,
        role: true,
      },
    });

    if (!user) return null;
    return {
      id: Number(user.id),
      username: user.username,
      password_hash: user.password_hash,
      role: toAdminRole(user.role),
    };
  }

  async createAccount(
    username: string,
    passwordHash: string,
    role: AdminRole,
  ): Promise<void> {
    await this.prisma.admin_users.create({
      data: {
        username,
        password_hash: passwordHash,
        role,
      },
    });
  }
}
