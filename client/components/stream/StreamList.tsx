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

export type LivePlatform = 'chzzk' | 'youtube';

export default function StreamList({
  initialItems = [],
}: {
  initialItems?: ChzzkLiveItem[];
}) {
  const [failedImages, setFailedImages] = React.useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [platform, setPlatform] = React.useState<LivePlatform>('chzzk');
  const [displayItems, setDisplayItems] = React.useState<ChzzkLiveItem[]>(
    initialItems,
  );

  React.useEffect(() => {
    setDisplayItems(initialItems);
  }, [initialItems]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/streamers/live?platform=${platform}&minViewers=0`);
      const data = (await res.json()) as ChzzkLiveItem[];
      setDisplayItems(data);
    } catch (error) {
      console.error('새로고침 실패:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePlatformChange = async (newPlatform: LivePlatform) => {
    if (newPlatform === platform) return; // 이미 선택된 플랫폼 중복 클릭 방지

    setPlatform(newPlatform);
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/streamers/live?platform=${newPlatform}&minViewers=0`);
      const data = (await res.json()) as ChzzkLiveItem[];
      setDisplayItems(data);
    } catch (error) {
      console.error('플랫폼 전환 실패:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleImageError = (channelId: string) => {
    setFailedImages((prev) => new Set([...prev, channelId]));
  };

  const handleClick = (item: ChzzkLiveItem) => {
    gaEvent("click_live", {
      platform,
      label: item.channelName,
      value: item.viewerCount,
    });
    window.open(item.liveUrl, "_blank");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          🎮 라이브
        </h2>
        <div className="flex items-center gap-1">
          <div className="flex bg-slate-200 dark:bg-slate-700 rounded p-0.5">
            <button
              onClick={() => handlePlatformChange('chzzk')}
              disabled={isRefreshing}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                platform === 'chzzk'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              } disabled:opacity-50`}
              aria-label="치지직 라이브"
            >
              치지직
            </button>
            <button
              onClick={() => handlePlatformChange('youtube')}
              disabled={isRefreshing}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                platform === 'youtube'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              } disabled:opacity-50`}
              aria-label="유튜브 라이브"
            >
              유튜브
            </button>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
            aria-label="새로고침"
          >
            {isRefreshing ? '중...' : '새로고침'}
          </button>
        </div>
      </div>

      {displayItems.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          현재 로스트아크 라이브가 없습니다
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {displayItems.map((item) => (
            <button
              key={item.channelId}
              onClick={() => handleClick(item)}
              className="group shrink-0 w-[180px] flex flex-col rounded-lg border border-slate-200 bg-white transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label={`${item.title} - ${item.channelName}`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-gradient-to-br from-purple-600 to-pink-600 dark:from-purple-700 dark:to-pink-700 flex items-center justify-center">
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
                <div className="absolute top-1 left-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  라이브
                </div>

                {/* Viewer Count */}
                <div className="absolute bottom-1 right-1 bg-black/70 text-white px-1.5 py-0.5 rounded text-[10px] font-medium">
                  {formatViewCount(item.viewerCount)}명
                </div>
              </div>

              <div className="flex flex-col gap-0.5 p-2">
                <h3 className="line-clamp-1 text-left text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
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
