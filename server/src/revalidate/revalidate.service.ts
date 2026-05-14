import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class RevalidateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RevalidateService.name);

  async onApplicationBootstrap(): Promise<void> {
    const url = process.env.NEXT_REVALIDATE_URL;
    const secret = process.env.NEXT_REVALIDATE_SECRET;

    if (!url || !secret) {
      this.logger.warn(
        'NEXT_REVALIDATE_URL 또는 NEXT_REVALIDATE_SECRET 미설정 — Vercel ISR 캐시 무효화 건너뜀',
      );
      return;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      });

      if (res.ok) {
        this.logger.log('Vercel ISR 캐시 무효화 성공');
      } else {
        this.logger.warn(`Vercel ISR 캐시 무효화 실패: HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      this.logger.warn(`Vercel ISR 캐시 무효화 오류: ${String(err)}`);
    }
  }
}
