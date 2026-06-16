import YoutubeList from "./YoutubeList";
import type { YoutubeVideo } from "@/types";

const API = process.env.NEST_API_URL ?? "http://localhost:3001";

export default async function YoutubeSection() {
  const data = await fetch(`${API}/api/streamers/popular?offset=0&limit=8`, {
    // 5분(홈 라우트 ISR과 동일) — 관리자 삭제가 홈에 빨리 반영되도록.
    next: { revalidate: 300 },
  })
    .then<{
      items: YoutubeVideo[];
      hasMore: boolean;
      nextOffset: number | null;
    }>((r) => r.json())
    .catch(() => ({
      items: [] as YoutubeVideo[],
      hasMore: false,
      nextOffset: null,
    }));

  return (
    <YoutubeList
      initialItems={data.items}
      initialHasMore={data.hasMore}
      initialNextOffset={data.nextOffset}
    />
  );
}
