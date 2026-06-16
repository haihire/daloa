import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CrawledPost,
  SiteCandidateDraft,
} from '../site-extractor.service';

export interface InvenPost {
  id: bigint;
  board: string;
  post_id: string;
  url: string;
  title: string;
  author: string;
  date_str: string;
  views: number;
  likes: number;
  content: string | null;
  crawled_at: Date;
}

export interface SiteCandidate {
  id: bigint;
  url: string;
  domain: string;
  name: string;
  description: string;
  category: string;
  mention_count: number;
  sample_post_id: string | null;
  status: string;
  created_at: Date;
}

@Injectable()
export class AdminInvenRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 추천 사이트 후보 목록 (status별 필터). 기본은 검토 대기(pending).
   * 노출 임계값: 누적 언급 2회 이상만 (1회성 URL 노이즈 숨김 — 증분 누적과 짝).
   */
  async getSiteCandidates(status = 'pending'): Promise<SiteCandidate[]> {
    return this.prisma.$queryRaw<SiteCandidate[]>`
      SELECT id, url, domain, name, description, category,
             mention_count, sample_post_id, status, created_at
      FROM inven_site_candidates
      WHERE status = ${status}
        AND mention_count >= 2
      ORDER BY mention_count DESC, created_at DESC
    `;
  }

  async getSiteCandidateById(id: number): Promise<SiteCandidate | null> {
    const rows = await this.prisma.$queryRaw<SiteCandidate[]>`
      SELECT id, url, domain, name, description, category,
             mention_count, sample_post_id, status, created_at
      FROM inven_site_candidates
      WHERE id = ${id}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /** 후보의 상태 변경 (added / rejected). */
  async updateCandidateStatus(id: number, status: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE inven_site_candidates
      SET status = ${status}
      WHERE id = ${id}
    `;
  }

  /** 도메인을 블랙리스트에 추가한다 (이미 있으면 무시). 다음 크롤부터 제외됨. */
  async addToBlacklist(domain: string, reason = ''): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO inven_site_blacklist (domain, reason)
      VALUES (${domain}, ${reason})
      ON CONFLICT (domain) DO NOTHING
    `;
  }

  /** 블랙리스트 도메인 집합 (사이트 추출 시 제외용). */
  async getBlacklistDomains(): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ domain: string }>>`
      SELECT domain FROM inven_site_blacklist
    `;
    return new Set(rows.map((r) => r.domain.toLowerCase()));
  }

  /** 이미 등록된 사이트의 href 목록 (사이트 추출 시 제외용 — 도메인 변환은 호출 측). */
  async getRegisteredHrefs(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ href: string }>>`
      SELECT href FROM loa_sites
    `;
    return rows.map((r) => r.href);
  }

  /**
   * 크롤된 게시글을 inven_posts에 일괄 upsert한다.
   * post_id 충돌 시 조회/추천/본문/제목을 최신값으로 갱신.
   * 댓글은 더 이상 수집하지 않음(본문만 사용) — comments는 빈 배열로 저장.
   */
  async upsertPosts(posts: CrawledPost[]): Promise<number> {
    let saved = 0;
    for (const p of posts) {
      await this.prisma.$executeRaw`
        INSERT INTO inven_posts
          (board, post_id, url, title, author, date_str, views, likes, content, comments)
        VALUES (
          ${p.board}, ${p.post_id}, ${p.url}, ${p.title}, ${p.author},
          ${p.date_str}, ${p.views}, ${p.likes}, ${p.content},
          '[]'::jsonb
        )
        ON CONFLICT (post_id) DO UPDATE SET
          views    = EXCLUDED.views,
          likes    = EXCLUDED.likes,
          content  = COALESCE(EXCLUDED.content, inven_posts.content),
          title    = EXCLUDED.title
      `;
      saved += 1;
    }
    return saved;
  }

  /**
   * 게시판별 최신 post_id(증분 크롤 기준). 데이터 없는 게시판은 0.
   * post_id는 숫자 문자열이라 bigint로 캐스팅해 최대값을 구한다.
   */
  async getMaxPostIdByBoard(): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ board: string; max_id: bigint | number | null }>
    >`
      SELECT board, MAX(post_id::bigint) AS max_id
      FROM inven_posts
      GROUP BY board
    `;
    const result: Record<string, number> = {};
    for (const r of rows) {
      result[r.board] = r.max_id != null ? Number(r.max_id) : 0;
    }
    return result;
  }

  /**
   * 추출된 사이트 후보를 inven_site_candidates에 upsert한다.
   * 도메인 단위로 1행만 유지 — domain 충돌 시 pending 상태면 대표 url(더 짧은 것)을
   * 갱신하고 언급 횟수를 누적 합산한다 (added/rejected는 건드리지 않음).
   * 크롤은 날짜별 증분 배치라, 덮어쓰면 과거 언급수가 사라져 정렬이 왜곡됨.
   */
  async upsertCandidates(drafts: SiteCandidateDraft[]): Promise<number> {
    let saved = 0;
    for (const d of drafts) {
      await this.prisma.$executeRaw`
        INSERT INTO inven_site_candidates
          (url, domain, name, description, category, mention_count, sample_post_id, status)
        VALUES (${d.url}, ${d.domain}, '', '', '', ${d.mention_count}, ${d.sample_post_id}, 'pending')
        ON CONFLICT (domain) DO UPDATE SET
          mention_count = inven_site_candidates.mention_count + EXCLUDED.mention_count,
          url = CASE
            WHEN length(EXCLUDED.url) < length(inven_site_candidates.url)
            THEN EXCLUDED.url ELSE inven_site_candidates.url
          END
        WHERE inven_site_candidates.status = 'pending'
      `;
      saved += 1;
    }
    return saved;
  }

  async getPosts(opts: {
    date?: string;
    board?: string;
    limit?: number;
    offset?: number;
  }): Promise<InvenPost[]> {
    const date = opts.date ?? null;
    const board = opts.board ?? null;
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    return this.prisma.$queryRaw<InvenPost[]>`
      SELECT id, board, post_id, url, title, author, date_str, views, likes,
             left(content, 300) AS content, crawled_at
      FROM inven_posts
      WHERE (${date}::date IS NULL OR crawled_at::date = ${date}::date)
        AND (${board}::text IS NULL OR board = ${board}::text)
      ORDER BY likes * 5 + views DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
}
