import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { chunk } from '../common/sql-batch.util';
import type { YoutubeVideoItem } from './youtube-videos.service';

// 한 배치가 보통 50~100건이라 한 방에 들어가지만, 상한이 늘어도 안전하도록 끊어 보낸다.
const SNAPSHOT_CHUNK = 200;

@Injectable()
export class StreamersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 인기 영상의 조회수를 (video_id, recorded_date) 단위로 upsert 한다.
   *
   * 건당 prisma.upsert 를 돌리면 행 수만큼 DB 왕복이 순차로 쌓인다 — 이 크론은
   * 인벤 크롤과 같은 시각(짝수시 정각)에 겹쳐서 nest CPU 스파이크의 한 축이었다.
   * 멀티로우 INSERT ... ON CONFLICT 한 번으로 묶는다.
   */
  async upsertViewSnapshots(items: YoutubeVideoItem[], date: string) {
    if (items.length === 0) return;

    // 같은 배치에 같은 video_id 가 두 번 오면 (video_id, recorded_date) 유니크 때문에
    // "ON CONFLICT DO UPDATE command cannot affect row a second time" 로 통째로 실패한다.
    const unique = new Map<string, YoutubeVideoItem>();
    for (const item of items) unique.set(item.videoId, item);

    for (const batch of chunk([...unique.values()], SNAPSHOT_CHUNK)) {
      const values: unknown[] = [];
      const tuples = batch.map((item) => {
        const i = values.length;
        values.push(
          item.videoId,
          item.title,
          item.channelTitle,
          item.thumbnailUrl,
          item.publishedAt,
          item.duration,
          item.viewCount,
          date,
        );
        // 멀티로우 VALUES 에서는 Postgres 가 파라미터 타입을 추론하지 못할 수 있어
        // 시각/숫자/날짜 컬럼엔 캐스트를 붙인다.
        return (
          `($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5}::timestamptz,` +
          `$${i + 6},$${i + 7}::bigint,$${i + 8}::date)`
        );
      });

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO youtube_view_snapshots
           (video_id, title, channel_title, thumbnail_url, published_at, duration, view_count, recorded_date)
         VALUES ${tuples.join(',')}
         ON CONFLICT (video_id, recorded_date) DO UPDATE SET
           view_count = EXCLUDED.view_count`,
        ...values,
      );
    }
  }

  /**
   * 게시일이 최근 `days`일 이내인 영상을 video_id 기준 1건씩(최신 스냅샷의 조회수)
   * 게시일 내림차순으로 반환한다.
   *
   * youtube_view_snapshots 는 (video_id, recorded_date) 당 1행이라 같은 영상이
   * 여러 날짜로 누적된다. DISTINCT ON 으로 가장 최근에 기록된 행만 골라
   * 최신 조회수를 쓴다. 7일 창 밖으로 밀려나 더는 갱신되지 않는 영상도
   * 게시일이 7일 이내면 그대로 노출된다(= 누적 서빙).
   */
  async findRecentVideos(days: number): Promise<YoutubeVideoItem[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        video_id: string;
        title: string;
        channel_title: string;
        thumbnail_url: string;
        published_at: Date;
        duration: string;
        view_count: bigint;
      }>
    >`
      SELECT DISTINCT ON (video_id)
        video_id,
        title,
        channel_title,
        thumbnail_url,
        published_at,
        duration,
        view_count
      FROM youtube_view_snapshots
      WHERE published_at >= NOW() - (${days}::int * INTERVAL '1 day')
      ORDER BY video_id, recorded_date DESC
    `;

    return rows
      .map((r) => ({
        videoId: r.video_id,
        title: r.title,
        channelTitle: r.channel_title,
        thumbnailUrl: r.thumbnail_url,
        publishedAt: r.published_at.toISOString(),
        duration: r.duration,
        viewCount: Number(r.view_count),
      }))
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }

  async findViewHistory(
    days: number,
  ): Promise<{ date: string; avg: number }[]> {
    return this.prisma.$queryRaw<{ date: string; avg: number }[]>`
      SELECT
        TO_CHAR(recorded_date, 'YYYY-MM-DD') AS date,
        ROUND(AVG(view_count))::int         AS avg
      FROM youtube_view_snapshots
      WHERE recorded_date >= CURRENT_DATE - (${days}::int * INTERVAL '1 day')
      GROUP BY recorded_date
      ORDER BY recorded_date ASC
    `;
  }
}
