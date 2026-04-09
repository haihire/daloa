export interface Site {
  name: string;
  href: string;
  category: string;
  description: string;
  icon?: string;
}

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
}

export interface StatBuildItem {
  classDetail: string;
  classEngraving: string | null;
  count: number;
  topLevel: number;
}

export interface StatBuildTab {
  statBuild: string;
  totalCount: number;
  items: StatBuildItem[];
}
