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

  // prerender 안전장치: API가 배열이 아닌 값(404 JSON 등)을 줘도 깨지지 않도록 방어
  const items = Array.isArray(data) ? data : [];

  return <StreamList initialItems={items} />;
}
