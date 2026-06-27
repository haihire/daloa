"use client";

import React from "react";
import Image from "next/image";
import type { ChzzkLiveItem } from "@/types";
import { event as gaEvent } from "@/lib/gtag";

function formatViewCount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export default function ChzzkList({
  initialItems = [],
}: {
  initialItems?: ChzzkLiveItem[];
}) {
  const [failedImages, setFailedImages] = React.useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [displayItems, setDisplayItems] = React.useState<ChzzkLiveItem[]>(
    initialItems,
  );

  React.useEffect(() => {
    setDisplayItems(initialItems);
  }, [initialItems]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/streamers/live?minViewers=0');
      const data = (await res.json()) as ChzzkLiveItem[];
      setDisplayItems(data);
    } catch (error) {
      console.error('새로고침 실패:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleImageError = (channelId: string) => {
    setFailedImages((prev) => new Set([...prev, channelId]));
  };

  const handleClick = (item: ChzzkLiveItem) => {
    gaEvent({
      action: "click_chzzk_live",
      category: "engagement",
      label: item.channelName,
      value: item.viewerCount,
    });
    window.open(item.liveUrl, "_blank");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          🎮 Chzzk 라이브
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
          aria-label="새로고침"
        >
          {isRefreshing ? '새로고침 중...' : '새로고침'}
        </button>
      </div>

      {displayItems.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          현재 로스트아크 라이브가 없습니다
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {displayItems.map((item) => (
            <button
              key={item.channelId}
              onClick={() => handleClick(item)}
              className="group shrink-0 rounded-lg border border-slate-200 bg-white transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label={`${item.title} - ${item.channelName}`}
            >
              <div className="relative h-[190px] w-[270px] overflow-hidden rounded-t-lg bg-gradient-to-br from-purple-600 to-pink-600 dark:from-purple-700 dark:to-pink-700 flex items-center justify-center">
                {!failedImages.has(item.channelId) && item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt={item.channelName}
                    fill
                    className="object-cover"
                    unoptimized
                    onError={() => handleImageError(item.channelId)}
                  />
                ) : item.channelImageUrl ? (
                  <Image
                    src={item.channelImageUrl}
                    alt={item.channelName}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="text-6xl opacity-30">🎮</div>
                )}

                {/* Live Badge */}
                <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  라이브
                </div>

                {/* Viewer Count */}
                <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium">
                  {formatViewCount(item.viewerCount)}명
                </div>
              </div>

              <div className="flex flex-col gap-1 p-3">
                <h3 className="line-clamp-2 text-left text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {item.title}
                </h3>
                <p className="text-left text-xs text-slate-600 dark:text-slate-400">
                  {item.channelName}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
