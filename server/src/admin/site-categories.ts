// 사이트 카테고리 고정 목록. 서버 단일 정본 — `GET /api/admin/sites/categories`로
// 클라이언트에 내려주고, site-suggest.service.ts(AI 추천 프롬프트/검증)도 이걸 참조한다.
// DB CHECK 제약(db-migrations/008_loa_sites_category_enum.sql)은 언어가 달라(SQL) 별도
// 정본으로 남는다 — 카테고리를 바꾸면 그쪽도 반드시 같이 바꿀 것.
export const SITE_CATEGORIES = [
  '계산기·툴',
  '빌드·세팅',
  '시세·경제',
  '공략·정보',
  '캐릭터·스펙',
  '전투분석·통계',
  '숙제·일정',
  '커뮤니티',
  '기타',
] as const;

export type SiteCategory = (typeof SITE_CATEGORIES)[number];
