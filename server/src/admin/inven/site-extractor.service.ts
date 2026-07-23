import { Injectable } from '@nestjs/common';

export interface CrawledComment {
  name: string;
  text: string;
  date: string;
  recommend: number;
}

export interface CrawledPost {
  board: string;
  post_id: string;
  url: string;
  title: string;
  author: string;
  date_str: string;
  posted_date: string | null;
  views: number;
  likes: number;
  content: string | null;
  comments: CrawledComment[];
}

export interface SiteCandidateDraft {
  url: string;
  domain: string;
  mention_count: number;
  sample_post_id: string | null;
}

// 추천에서 항상 제외할 도메인 (인벤 자체, 광고, 대형 플랫폼, lomoa/daloa, 게임 공식)
const EXCLUDE_DOMAINS = new Set([
  'inven.co.kr',
  'upload3.inven.co.kr',
  'upload2.inven.co.kr',
  'imart.inven.co.kr',
  'm.inven.co.kr',
  'pick.inven.co.kr',
  'lostark.inven.co.kr',
  'daloa.kr',
  'www.daloa.kr',
  'lomoa.kr',
  'www.lomoa.kr',
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
  'x.com',
  'twitter.com',
  'google.com',
  'share.google',
  'chzzk.naver.com',
  'naver.com',
  'gall.dcinside.com',
  'archive.md',
  'archive.today',
  'threads.com',
  'ruliweb.com',
  'm.ruliweb.com',
  'gmarket.co.kr',
  'link.gmarket.co.kr',
  'danawa.com',
  'prod.danawa.com',
  'index.go.kr',
  'go.kr',
  'onstove.com',
  'm-lostark.game.onstove.com',
  'lostark.game.onstove.com',
]);

// 증분 크롤은 실행 배치가 작아(2시간치) 배치별 임계값을 두면 저빈도 사이트를 놓친다.
// → extract는 1회 이상이면 후보로 만들어 누적시키고, 노출 임계값(누적 ≥2)은 조회 시점에 적용.
const MIN_MENTIONS = 1;
const URL_RE = /https?:\/\/[^\s"<>)\]}]+/g;

// URL 끝의 구두점·괄호·zero-width space(U+200B) 제거.
// (소스에 U+200B 리터럴을 두지 않으려고 동적 생성)
const TRAILING_RE = new RegExp(`[.,)\\]}${String.fromCharCode(0x200b)}]+$`);
function stripTrail(url: string): string {
  return url.replace(TRAILING_RE, '');
}

/**
 * 크롤된 게시글(본문+댓글)에서 외부 사이트 URL을 추출하고,
 * 제외 도메인·블랙리스트·기존 등록 도메인을 걸러 추천 후보를 만든다.
 * (DB 접근 없음 — 순수 함수. 호출 측이 existing/blacklist를 넘긴다.)
 */
@Injectable()
export class SiteExtractorService {
  /** URL에서 도메인 추출 + www. 제거 */
  normalizeDomain(url: string): string {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.startsWith('www.') ? host.slice(4) : host;
    } catch {
      return '';
    }
  }

  /** 서브도메인 제거한 루트 도메인 (a.b.co.kr → b.co.kr) */
  rootDomain(domain: string): string {
    const parts = domain.split('.');
    if (
      parts.length >= 3 &&
      ['co', 'go', 'or', 'ne'].includes(parts[parts.length - 2])
    ) {
      return parts.slice(-3).join('.');
    }
    return parts.length >= 2 ? parts.slice(-2).join('.') : domain;
  }

  private isExcluded(domain: string): boolean {
    return (
      EXCLUDE_DOMAINS.has(domain) ||
      EXCLUDE_DOMAINS.has(this.rootDomain(domain))
    );
  }

  /**
   * 게시글 목록에서 추천 후보 도메인을 추출한다.
   * @param posts 크롤된 게시글
   * @param existingDomains 이미 loa_sites에 등록된 도메인(루트 포함)
   * @param blacklist 거부된 도메인(루트 포함)
   */
  extract(
    posts: CrawledPost[],
    existingDomains: Set<string>,
    blacklist: Set<string>,
  ): SiteCandidateDraft[] {
    // 도메인별 집계
    const agg = new Map<
      string,
      { count: number; urls: Set<string>; samplePost: string | null }
    >();

    for (const post of posts) {
      // 본문만 스캔 (댓글은 더 이상 수집하지 않음)
      const blob = post.content ?? '';
      const matches = blob.match(URL_RE) ?? [];

      for (const match of matches) {
        // URL 끝의 구두점·괄호·zero-width space(U+200B) 제거
        const raw = stripTrail(match);
        const domain = this.normalizeDomain(raw);
        if (!domain) continue;
        let entry = agg.get(domain);
        if (!entry) {
          entry = { count: 0, urls: new Set(), samplePost: null };
          agg.set(domain, entry);
        }
        entry.count += 1;
        entry.urls.add(raw);
        if (entry.samplePost === null) entry.samplePost = post.post_id;
      }
    }

    // 필터링
    const candidates: SiteCandidateDraft[] = [];
    for (const [domain, entry] of agg) {
      if (this.isExcluded(domain)) continue;
      const root = this.rootDomain(domain);
      if (blacklist.has(domain) || blacklist.has(root)) continue;
      if (existingDomains.has(domain) || existingDomains.has(root)) continue;
      if (entry.count < MIN_MENTIONS) continue;

      const sampleUrl = [...entry.urls].sort((a, b) => a.length - b.length)[0];
      candidates.push({
        url: sampleUrl,
        domain,
        mention_count: entry.count,
        sample_post_id: entry.samplePost,
      });
    }

    candidates.sort((a, b) => b.mention_count - a.mention_count);
    return candidates;
  }
}
