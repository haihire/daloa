import YoutubeList from "./YoutubeList";
import type { YoutubeVideo } from "@/types";

const API = process.env.NEST_API_URL ?? "http://localhost:3001";

async function recordServerTiming(input: {
  name: string;
  path: string;
  durationMs: number;
}) {
  await fetch(`${API}/api/telemetry/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "request",
      scope: "section",
      ...input,
    }),
    cache: "no-store",
  }).catch(() => {});
}

export default async function YoutubeSection() {
  const started = Date.now();
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

  void recordServerTiming({
    name: "youtube",
    path: "/api/streamers/popular?offset=0&limit=8",
    durationMs: Date.now() - started,
  });

  return (
    <YoutubeList
      initialItems={data.items}
      initialHasMore={data.hasMore}
      initialNextOffset={data.nextOffset}
    />
  );
}
