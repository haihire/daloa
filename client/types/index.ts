export interface Site {
  // 클릭 집계 조인 키(loa_sites.seq). 이름/카테고리가 바뀌어도 안 변하는 사이트 식별자 —
  // 클릭 텔레메트리 전송 시 이 값을 같이 보내야 관리자 "클릭 상위"가 사이트당 한 줄로 유지된다.
  seq?: number;
  name: string;
  href: string;
  category: string;
  description: string;
  icon?: string | null;
  clickCount?: number;
}

// 이름과 달리 Chzzk 전용이 아니다 — /api/streamers/live는 platform 쿼리에 따라
// Chzzk·YouTube 라이브를 같은 모양으로 반환한다(server/src/streamers/chzzk.client.ts
// LiveItem과 동일 형태).
export interface LiveItem {
  platform: "chzzk" | "youtube";
  channelId: string;
  channelName: string;
  title: string;
  viewerCount: number;
  thumbnailUrl: string;
  channelImageUrl?: string;
  liveUrl: string;
  startedAt: string;
}
