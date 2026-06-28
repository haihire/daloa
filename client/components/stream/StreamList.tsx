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
  const [loadedImages, setLoadedImages] = React.useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSpin, setRefreshSpin] = React.useState(false);
  const [platform, setPlatform] = React.useState<LivePlatform>('chzzk');
  const [displayItems, setDisplayItems] = React.useState<ChzzkLiveItem[]>(
    Array.isArray(initialItems) ? initialItems : [],
  );

  React.useEffect(() => {
    setDisplayItems(Array.isArray(initialItems) ? initialItems : []);
    setLoadedImages(new Set());
  }, [initialItems]);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    setRefreshSpin(true);
    try {
      const res = await fetch(`/api/streamers/live?platform=${platform}&minViewers=0`);
      const data = (await res.json()) as ChzzkLiveItem[];
      setLoadedImages(new Set());
      setDisplayItems(data);
    } catch (error) {
      console.error('새로고침 실패:', error);
    } finally {
      setIsRefreshing(false);
      setRefreshSpin(false);
    }
  }, [platform]);

  const handlePlatformChange = React.useCallback(async (newPlatform: LivePlatform) => {
    // 이미 선택된 플랫폼 중복 클릭 방지 (함수형 업데이트로 최신 platform 비교)
    let isSame = false;
    setPlatform((prev) => {
      if (prev === newPlatform) {
        isSame = true;
        return prev;
      }
      return newPlatform;
    });
    if (isSame) return;

    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/streamers/live?platform=${newPlatform}&minViewers=0`);
      const data = (await res.json()) as ChzzkLiveItem[];
      setLoadedImages(new Set());
      setDisplayItems(data);
    } catch (error) {
      console.error('플랫폼 전환 실패:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleImageError = (channelId: string) => {
    setFailedImages((prev) => new Set([...prev, channelId]));
  };

  const handleImageLoad = (channelId: string) => {
    setLoadedImages((prev) => new Set([...prev, channelId]));
  };

  const handleClick = (item: ChzzkLiveItem) => {
    gaEvent("click_live", {
      platform,
      label: item.channelName,
      value: item.viewerCount,
    });
    window.open(item.liveUrl, "_blank");
  };

  // 토글 버튼 섹션을 메모이제이션 (displayItems 변경 시 재렌더링 방지)
  const controlsBar = React.useMemo(() => (
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
            }`}
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
            }`}
            aria-label="유튜브 라이브"
          >
            유튜브
          </button>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 active:scale-95 dark:bg-slate-700 dark:hover:bg-slate-600 transition-all flex items-center gap-1"
          aria-label="새로고침"
        >
          <svg
            viewBox="0 0 24 24"
            width={12}
            height={12}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={refreshSpin ? 'animate-spin' : ''}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          새로고침
        </button>
      </div>
    </div>
  ), [platform, isRefreshing, refreshSpin, handlePlatformChange, handleRefresh]);

  return (
    <div className="flex flex-col gap-2">
      {controlsBar}

      {displayItems.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          현재 로스트아크 라이브가 없습니다
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1 snap-x snap-mandatory">
          {displayItems.map((item) => (
            <button
              key={item.channelId}
              onClick={() => handleClick(item)}
              className="group shrink-0 w-[180px] flex flex-col rounded-lg border border-slate-200 bg-white transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 snap-start"
              aria-label={`${item.title} - ${item.channelName}`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                {/* 로드 전 스켈레톤 (이미지 준비되면 가려짐) */}
                {!loadedImages.has(item.channelId) && (
                  <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />
                )}
                {!failedImages.has(item.channelId) && item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt={item.channelName}
                    fill
                    className={`object-cover ${
                      loadedImages.has(item.channelId)
                        ? 'youtube-card-enter'
                        : 'opacity-0'
                    }`}
                    unoptimized
                    onLoad={() => handleImageLoad(item.channelId)}
                    onError={() => handleImageError(item.channelId)}
                  />
                ) : item.channelImageUrl ? (
                  <Image
                    src={item.channelImageUrl}
                    alt={item.channelName}
                    fill
                    className={`object-cover ${
                      loadedImages.has(item.channelId)
                        ? 'youtube-card-enter'
                        : 'opacity-0'
                    }`}
                    unoptimized
                    onLoad={() => handleImageLoad(item.channelId)}
                  />
                ) : (
                  <div className="text-6xl opacity-30">🎮</div>
                )}

                {/* Live Badge */}
                <div className="absolute top-1 left-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  라이브
                </div>
              </div>

              <div className="flex flex-col gap-0.5 p-2">
                <h3 className="line-clamp-1 text-left text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {item.title}
                </h3>
                <p className="text-left text-xs text-slate-600 dark:text-slate-400">
                  {item.channelName}
                </p>
                <div className="flex justify-end pt-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {formatViewCount(item.viewerCount)}명
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
