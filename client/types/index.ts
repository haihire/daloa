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

export interface ChzzkLiveItem {
  platform: "chzzk";
  channelId: string;
  channelName: string;
  title: string;
  viewerCount: number;
  thumbnailUrl: string;
  channelImageUrl?: string;
  liveUrl: string;
  startedAt: string;
}
