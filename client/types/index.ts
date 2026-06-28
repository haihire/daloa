export interface Site {
  name: string;
  href: string;
  category: string;
  description: string;
  clickCount?: number;
}

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
}

export interface StatBuildItem {
  classDetail: string;
  classEngraving: string | null;
  count: number;
}

export interface StatBuildTab {
  statBuild: string;
  totalCount: number;
  items: StatBuildItem[];
}

export interface ClassSummary {
  className: string;
  summary: string;
  updatedAt: string;
}

export interface ChzzkLiveItem {
  platform: 'chzzk';
  channelId: string;
  channelName: string;
  title: string;
  viewerCount: number;
  thumbnailUrl: string;
  channelImageUrl?: string;
  liveUrl: string;
  startedAt: string;
}
