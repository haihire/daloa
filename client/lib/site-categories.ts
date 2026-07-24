// 사이트 카테고리 고정 목록 (클라이언트 단일 정본).
// 사이트 관리 폼과 인벤 후보 승인 폼이 함께 참조한다.
// 아래 세 곳과 반드시 같이 바꿀 것:
//   - db/migrations/008_loa_sites_category_enum.sql 의 CHECK 목록
//   - server/src/admin/inven/site-suggest.service.ts 의 CATEGORIES
export const SITE_CATEGORIES = [
  "계산기·툴",
  "빌드·세팅",
  "시세·경제",
  "공략·정보",
  "캐릭터·스펙",
  "전투분석·통계",
  "숙제·일정",
  "커뮤니티",
  "기타",
] as const;

export type SiteCategory = (typeof SITE_CATEGORIES)[number];
