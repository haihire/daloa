export interface Site {
  name: string;
  href: string;
  category: string;
  description: string;
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
