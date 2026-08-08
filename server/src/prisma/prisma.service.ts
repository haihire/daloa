import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

(BigInt.prototype as unknown as Record<string, unknown>)['toJSON'] = function (
  this: bigint,
) {
  return this.toString();
};

// DB 서버(로컬/EC2 공통)의 세션 기본 타임존이 Asia/Seoul이라 @prisma/adapter-pg가
// TIMESTAMPTZ 를 파싱할 때 오프셋을 무시하고 KST 벽시계 값을 그대로 UTC로 취급해버려
// $queryRaw로 받은 Date가 실제보다 9시간 앞서는 버그가 있었다(예: 22:15 KST 발생 →
// 07:15 KST 다음날로 표시). 세션을 UTC로 고정해 근본적으로 회피한다.
function withUtcSessionTimezone(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const existingOptions = url.searchParams.get('options');
  url.searchParams.set(
    'options',
    existingOptions ? `${existingOptions} -c timezone=UTC` : '-c timezone=UTC',
  );
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const rawDatabaseUrl = process.env.DATABASE_URL;
    const schema = process.env.PRISMA_DB_SCHEMA ?? 'public';
    if (!rawDatabaseUrl) {
      throw new Error('DATABASE_URL is required for PrismaService');
    }
    const connectionString = withUtcSessionTimezone(rawDatabaseUrl);
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
