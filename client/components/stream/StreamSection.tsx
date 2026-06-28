import StreamList from "./StreamList";
import type { ChzzkLiveItem } from "@/types";

const API = process.env.NEST_API_URL ?? "http://localhost:3001";

export default async function StreamSection() {
  const data = await fetch(`${API}/api/streamers/live?minViewers=0`, {
    // 1분(실시간 라이브 변동) — 최신 방송 반영
    next: { revalidate: 60 },
  })
    .then<ChzzkLiveItem[]>((r) => r.json())
    .catch(() => [] as ChzzkLiveItem[]);

  return <StreamList initialItems={data} />;
}
