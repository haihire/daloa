import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

(BigInt.prototype as unknown as Record<string, unknown>)['toJSON'] = function (
  this: bigint,
) {
  return this.toString();
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const schema = process.env.PRISMA_DB_SCHEMA ?? 'public';
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for PrismaService');
    }
    // PM2 cluster 2개 인스턴스 × max 2 = 총 4 커넥션.
    // 1차 축소(인스턴스당 6, 총 12) 실측 결과 DB active 쿼리가 항상 1~2개로 여유가 커
    // 8/6 단계를 건너뛰고 최종 후보인 4까지 바로 축소 — notes/적용/db-connection-pool-tuning.md
    super({
      adapter: new PrismaPg({ connectionString, max: 2 }, { schema }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
}
