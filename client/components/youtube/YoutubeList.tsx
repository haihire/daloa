"use client";

import { useEffect, useRef, useState } from "react";
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

function formatViewCount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export default function YoutubeList() {
  const [items, setItems] = useState<YoutubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedOnce = useRef(false);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const syncingRef = useRef(false);

  const scroll = (dir: "left" | "right") => {
    listRef.current?.scrollBy({
      left: dir === "right" ? 280 : -280,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const topEl = topScrollRef.current;
    const listEl = listRef.current;
    if (!topEl || !listEl) return;

    const syncTopWidth = () => {
      const spacer = topEl.firstElementChild as HTMLDivElement | null;
      if (!spacer) return;
      spacer.style.width = `${listEl.scrollWidth}px`;
    };

    const handleTopScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      listEl.scrollLeft = topEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    };

    const handleListScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      topEl.scrollLeft = listEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    };

    syncTopWidth();
    topEl.scrollLeft = listEl.scrollLeft;

    topEl.addEventListener("scroll", handleTopScroll);
    listEl.addEventListener("scroll", handleListScroll);

    const resizeObserver = new ResizeObserver(() => {
      syncTopWidth();
      topEl.scrollLeft = listEl.scrollLeft;
    });

    resizeObserver.observe(listEl);
    Array.from(listEl.children).forEach((child) =>
      resizeObserver.observe(child),
    );
    window.addEventListener("resize", syncTopWidth);

    return () => {
      topEl.removeEventListener("scroll", handleTopScroll);
      listEl.removeEventListener("scroll", handleListScroll);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncTopWidth);
    };
  }, [items]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    setLoading(true);
    fetch(`${API}/api/streamers/popular`)
      .then((r) => r.json())
      .then((data) => {
        const raw: YoutubeVideo[] = Array.isArray(data.items) ? data.items : [];
        // 최신순 정렬
        raw.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        );
        setItems(raw);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="fade-in">
      <div className="mb-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-slate-900">로아 영상</h2>
          <span className="text-xs text-slate-400">심심할 때 보는</span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => scroll("left")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-red-300 hover:text-red-500 hover:shadow-md disabled:cursor-default disabled:opacity-40"
            aria-label="이전"
            disabled={loading || items.length === 0}
          >
            ‹
          </button>
          <button
            onClick={() => scroll("right")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-red-300 hover:text-red-500 hover:shadow-md disabled:cursor-default disabled:opacity-40"
            aria-label="다음"
            disabled={loading || items.length === 0}
          >
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-52 shrink-0 animate-pulse rounded-xl bg-slate-100"
              style={{ height: 160 }}
            />
          ))}
        </div>
      ) : (
        <div>
          <div
            ref={topScrollRef}
            className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:theme(colors.slate.400)_theme(colors.slate.100)] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400"
          >
            <div className="h-3" />
          </div>
          <ul
            ref={listRef}
            className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((v) => (
              <li key={v.videoId} className="w-52 shrink-0 flex">
                <a
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col h-full gap-2 rounded-xl border border-slate-200 bg-white p-2 transition-transform duration-150 hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md"
                >
                  {v.thumbnailUrl && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="h-28 w-full rounded-lg object-cover"
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-bold text-white leading-none">
                        {v.duration}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col flex-1 justify-between gap-0.5 px-0.5 pb-0.5 min-h-0">
                    <p className="line-clamp-2 text-xs font-medium text-slate-800 leading-snug">
                      {v.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="truncate text-[11px] text-slate-500">
                        {v.channelTitle}
                      </span>
                      <span className="ml-1 shrink-0 text-[11px] text-slate-400">
                        {timeAgo(v.publishedAt)}
                      </span>
                    </div>
                    {v.viewCount > 0 && (
                      <span className="text-[11px] text-slate-400">
                        조회수 {formatViewCount(v.viewCount)}
                      </span>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
