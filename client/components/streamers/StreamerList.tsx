"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { YoutubeVideo } from "@/types";

const API = process.env.NEXT_PUBLIC_NEST_API_URL ?? "http://localhost:3001";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(mo / 12)}년 전`;
}

export default function StreamerList() {
  const [items, setItems] = useState<YoutubeVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadedOnce = useRef(false);

  const loadNext = useCallback(
    async (token?: string) => {
      if (loading) return;
      setLoading(true);
      try {
        const url = token
          ? `${API}/api/streamers?pageToken=${encodeURIComponent(token)}`
          : `${API}/api/streamers`;
        const res = await fetch(url);
        const data = await res.json();
        const incoming: YoutubeVideo[] = Array.isArray(data.items)
          ? data.items
          : [];
        setItems((prev) => (token ? [...prev, ...incoming] : incoming));
        setNextPageToken(data.nextPageToken ?? null);
        setHasMore(!!data.nextPageToken);
      } catch {
        // 조용히 무시
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  // 첫 로드
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 무한 스크롤 sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading && nextPageToken) {
          loadNext(nextPageToken);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, nextPageToken, loadNext]);

  return (
    <aside className="flex max-h-[calc(100vh-160px)] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur fade-in delay-2">
      <h2 className="shrink-0 border-b border-slate-100 px-4 py-3 text-lg font-semibold text-slate-900">
        유튜브 최신 영상
        <span className="ml-2 text-xs font-normal text-slate-400">
          로스트아크 검색
        </span>
      </h2>

      <ul className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.map((v) => (
          <li key={v.videoId}>
            <a
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 transition-transform duration-150 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50"
            >
              {v.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="relative shrink-0">
                  <img
                    src={v.thumbnailUrl}
                    alt=""
                    className="h-14 w-24 rounded-lg object-cover"
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-bold text-white leading-none">
                    {v.duration}
                  </span>
                </div>
              )}
              <div className="flex min-w-0 flex-col justify-between">
                <p className="line-clamp-2 text-xs font-medium text-slate-800 leading-snug">
                  {v.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-slate-600 truncate">
                    {v.channelTitle}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-slate-400">
                    {timeAgo(v.publishedAt)}
                  </span>
                </div>
              </div>
            </a>
          </li>
        ))}

        {/* 스크롤 감지 sentinel */}
        <div ref={sentinelRef} className="py-1 text-center">
          {loading && (
            <span className="text-xs text-slate-400">불러오는 중…</span>
          )}
          {!hasMore && items.length > 0 && (
            <span className="text-xs text-slate-300">— 끝 —</span>
          )}
          {!loading && items.length === 0 && (
            <span className="text-xs text-slate-400">
              영상을 불러올 수 없습니다
            </span>
          )}
        </div>
      </ul>
    </aside>
  );
}
