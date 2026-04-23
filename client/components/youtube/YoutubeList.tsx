"use client";

import { useEffect, useRef, useState } from "react";
import type { YoutubeVideo } from "@/types";

const API = process.env.NEXT_PUBLIC_NEST_API_URL ?? "http://localhost:3001";
const INITIAL_LIMIT = 8;
const APPEND_LIMIT = 3;

interface PopularChunkResponse {
  items?: YoutubeVideo[];
  hasMore?: boolean;
  nextOffset?: number | null;
}

interface PrefetchedChunk {
  offset: number;
  items: YoutubeVideo[];
  hasMore: boolean;
  nextOffset: number | null;
}

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [enteringCount, setEnteringCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const loadedOnce = useRef(false);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<YoutubeVideo[]>([]);
  const syncingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const enteringTimerRef = useRef<number | null>(null);
  const preloadedRef = useRef<PrefetchedChunk | null>(null);
  const preloadingRef = useRef(false);

  const loadMoreRef = useRef<() => void>(() => {});

  const toSortedItems = (raw: YoutubeVideo[]) => {
    const copy = [...raw];
    copy.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    return copy;
  };

  const mergeUniqueByVideoId = (
    prev: YoutubeVideo[],
    incoming: YoutubeVideo[],
  ) => {
    if (incoming.length === 0) return prev;
    const seen = new Set(prev.map((v) => v.videoId));
    const next = [...prev];
    for (const item of incoming) {
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      next.push(item);
    }
    return next;
  };

  const toEndpoint = (offset: number, limit: number) =>
    `${API}/api/streamers/popular?offset=${offset}&limit=${limit}`;

  const fetchChunk = async (offset: number, limit: number) => {
    const data: PopularChunkResponse = await fetch(
      toEndpoint(offset, limit),
    ).then((r) => r.json());
    return {
      items: Array.isArray(data.items) ? data.items : [],
      hasMore: Boolean(data.hasMore),
      nextOffset: data.nextOffset ?? null,
    };
  };

  const requestPreload = async () => {
    if (loading || loadingMore || !hasMore || nextOffset === null) return;
    if (preloadingRef.current) return;
    if (preloadedRef.current?.offset === nextOffset) return;

    preloadingRef.current = true;
    try {
      const chunk = await fetchChunk(nextOffset, APPEND_LIMIT);
      preloadedRef.current = {
        offset: nextOffset,
        items: chunk.items,
        hasMore: chunk.hasMore,
        nextOffset: chunk.nextOffset,
      };
    } catch {
      // 조용히 무시
    } finally {
      preloadingRef.current = false;
    }
  };

  const loadMore = async () => {
    if (loading || loadingMoreRef.current || !hasMore || nextOffset === null) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      let incoming: YoutubeVideo[] = [];
      let nextHasMore = false;
      let nextCursor: number | null = null;

      const prefetched = preloadedRef.current;
      if (prefetched && prefetched.offset === nextOffset) {
        incoming = prefetched.items;
        nextHasMore = prefetched.hasMore;
        nextCursor = prefetched.nextOffset;
        preloadedRef.current = null;
      } else {
        const chunk = await fetchChunk(nextOffset, APPEND_LIMIT);
        incoming = chunk.items;
        nextHasMore = chunk.hasMore;
        nextCursor = chunk.nextOffset;
      }

      if (incoming.length > 0) {
        const sortedIncoming = toSortedItems(incoming);
        const seen = new Set(itemsRef.current.map((v) => v.videoId));
        const uniqueIncoming = sortedIncoming.filter(
          (v) => !seen.has(v.videoId),
        );

        if (uniqueIncoming.length > 0) {
          const nextItems = [...itemsRef.current, ...uniqueIncoming];
          itemsRef.current = nextItems;
          setItems(nextItems);
          setEnteringCount(uniqueIncoming.length);
          if (enteringTimerRef.current !== null) {
            window.clearTimeout(enteringTimerRef.current);
          }
          enteringTimerRef.current = window.setTimeout(() => {
            setEnteringCount(0);
          }, 420);
        }
      }
      setHasMore(nextHasMore);
      setNextOffset(nextCursor);

      if (nextHasMore && nextCursor !== null) {
        requestAnimationFrame(() => {
          void requestPreload();
        });
      }
    } catch {
      // 조용히 무시
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  loadMoreRef.current = () => {
    const listEl = listRef.current;
    if (!listEl || !hasMore || loading || loadingMore) return;

    const remain =
      listEl.scrollWidth - (listEl.scrollLeft + listEl.clientWidth);
    if (remain < 560) {
      void requestPreload();
    }
    if (remain < 140) {
      void loadMore();
    }
  };

  const scroll = (dir: "left" | "right") => {
    listRef.current?.scrollBy({
      left: dir === "right" ? 280 : -280,
      behavior: "smooth",
    });

    if (dir === "right") {
      requestAnimationFrame(() => {
        loadMoreRef.current();
      });
    }
  };

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      if (enteringTimerRef.current !== null) {
        window.clearTimeout(enteringTimerRef.current);
      }
    };
  }, []);

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
        loadMoreRef.current();
      });
    };

    const handleListScroll = () => {
      syncingRef.current = true;
      topEl.scrollLeft = listEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });

      loadMoreRef.current();
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
    fetch(toEndpoint(0, INITIAL_LIMIT))
      .then((r) => r.json())
      .then((data: PopularChunkResponse) => {
        const raw: YoutubeVideo[] = Array.isArray(data.items) ? data.items : [];
        const initialItems = mergeUniqueByVideoId([], toSortedItems(raw));
        setItems(initialItems);
        itemsRef.current = initialItems;
        setHasMore(Boolean(data.hasMore));
        setNextOffset(data.nextOffset ?? null);
        preloadedRef.current = null;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="fade-in">
      <div className="mb-0 flex flex-row items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">로아 영상</h2>
          <span className="hidden text-xs text-slate-400 sm:inline">
            심심할 때 보는
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 sm:gap-2">
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
        <div className="flex gap-2 overflow-x-auto pb-2 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[calc(50%-0.5rem)] shrink-0 animate-pulse rounded-xl bg-slate-100 sm:w-52"
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
            <div className="h-3 transition-[width] duration-200 ease-out" />
          </div>
          <ul
            ref={listRef}
            className="flex gap-2 overflow-x-auto pb-2 sm:gap-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {(() => {
              const enteringStart = Math.max(items.length - enteringCount, 0);
              return items.map((v, idx) => {
                const isEntering = enteringCount > 0 && idx >= enteringStart;
                return (
                  <li
                    key={`${v.videoId}-${idx}`}
                    className={`w-[calc(50%-0.5rem)] shrink-0 flex sm:w-52 ${isEntering ? "youtube-card-enter" : ""}`}
                  >
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
                );
              });
            })()}
            {loadingMore && (
              <li key="loading-more-indicator" className="w-52 shrink-0 flex">
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-slate-500">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-red-400" />
                  <span className="text-xs">불러오는 중...</span>
                </div>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
