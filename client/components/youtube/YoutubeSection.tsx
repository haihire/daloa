import YoutubeList from "./YoutubeList";
import type { YoutubeVideo } from "@/types";

const API = process.env.NEST_API_URL ?? "http://localhost:3001";

export default async function YoutubeSection() {
  const data = await fetch(`${API}/api/streamers/popular?offset=0&limit=8`, {
    next: { revalidate: 3600 },
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
