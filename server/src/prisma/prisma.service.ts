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
    // PM2 cluster 2개 인스턴스 × max 6 = 총 12 커넥션.
    // 부하테스트 실측(60 VU 부하 시 실사용 최대 12, 평균 6.77 — notes/적용/db-connection-pool-tuning.md)
    // 대비 기존 기본값(인스턴스당 10, 총 20)이 과다 프로비저닝이라 축소.
    super({
      adapter: new PrismaPg({ connectionString, max: 6 }, { schema }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
}
