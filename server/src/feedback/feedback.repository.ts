import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FeedbackRecord {
  id: number;
  message: string;
  path: string;
  device_type: string;
  created_at: Date;
  /** 작성자 브라우저가 센 방문 이력 요약. 0 = 기록 없음(기능 배포 이전) */
  visit_days: number;
  visit_count: number;
  first_seen_at: Date | null;
}

export interface FeedbackCreateInput {
  message: string;
  path: string;
  deviceType: string;
  visitDays: number;
  visitCount: number;
  firstSeenAt: Date | null;
}

export interface FeedbackPage {
  items: FeedbackRecord[];
  total: number;
}

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: FeedbackCreateInput): Promise<number> {
    const created = await this.prisma.user_feedbacks.create({
      data: {
        message: input.message,
        path: input.path,
        device_type: input.deviceType,
        visit_days: input.visitDays,
        visit_count: input.visitCount,
        first_seen_at: input.firstSeenAt,
      },
      select: { id: true },
    });
    return Number(created.id);
  }

  /** 어드민 목록 — 최신순 1페이지 + 전체 건수(페이지네이션용). */
  async findPage(limit: number, offset: number): Promise<FeedbackPage> {
    const [rows, total] = await Promise.all([
      this.prisma.user_feedbacks.findMany({
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.user_feedbacks.count(),
    ]);

    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        message: row.message,
        path: row.path,
        device_type: row.device_type,
        created_at: row.created_at,
        visit_days: row.visit_days,
        visit_count: row.visit_count,
        first_seen_at: row.first_seen_at,
      })),
      total,
    };
  }

  async exists(id: number): Promise<boolean> {
    const row = await this.prisma.user_feedbacks.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  async delete(id: number): Promise<void> {
    await this.prisma.user_feedbacks.delete({ where: { id } });
  }
}
