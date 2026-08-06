"use client";

import React from "react";
import Image from "next/image";
import type { LiveItem } from "@/types";
import { event as gaEvent } from "@/lib/gtag";

function formatViewCount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

function imageSrcKey(item: LiveItem): string {
  return item.thumbnailUrl || item.channelImageUrl || "";
}

export type LivePlatform = "chzzk" | "youtube";

export default function StreamList({
  initialItems = [],
}: {
  initialItems?: LiveItem[];
}) {
  const [failedImages, setFailedImages] = React.useState<Set<string>>(
    new Set(),
  );
  const [loadedImages, setLoadedImages] = React.useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSpin, setRefreshSpin] = React.useState(false);
  const [platform, setPlatform] = React.useState<LivePlatform>("chzzk");
  const [displayItems, setDisplayItems] = React.useState<LiveItem[]>(
    Array.isArray(initialItems) ? initialItems : [],
  );
  // 최신 displayItems를 항상 참조하기 위한 ref — applyNewItems가 useCallback 클로저에
  // 갇힌 stale 값이 아니라 실제 "지금 화면에 있는" 이전 아이템과 비교하게 한다.
  const displayItemsRef = React.useRef(displayItems);
  React.useEffect(() => {
    displayItemsRef.current = displayItems;
  }, [displayItems]);

  /**
   * 새 데이터를 반영하되, 이미지 URL이 실제로 바뀐(또는 새로 들어온) 채널만
   * loadedImages에서 지운다. channelId가 같고 URL도 그대로면 브라우저가 이미 로드해둔
   * <Image>를 React가 재사용하는데, 그때 loadedImages를 통째로 비우면 src가 안
   * 바뀌었으니 onLoad가 다시 안 터져서 opacity-0에 영원히 갇히는 버그가 있었다
   * (새로고침·플랫폼 전환·마운트 시 전부 이 문제를 겪었다).
   * failedImages는 항상 전부 지운다 — 실패는 "로드된 상태"가 아니라 브라우저가
   * 캐시하지 않으므로, src가 그대로여도 재시도 자체는 안전하다(예전엔 한 번 실패하면
   * 계속 실패로 남아있던 반대 방향 버그가 있었다).
   */
  const applyNewItems = React.useCallback((items: LiveItem[]) => {
    const prevByChannel = new Map(
      displayItemsRef.current.map((it) => [it.channelId, imageSrcKey(it)]),
    );
    setLoadedImages((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (prevByChannel.get(item.channelId) !== imageSrcKey(item)) {
          next.delete(item.channelId);
        }
      }
      return next;
    });
    setFailedImages(new Set());
    setDisplayItems(items);
  }, []);

  React.useEffect(() => {
    applyNewItems(Array.isArray(initialItems) ? initialItems : []);
  }, [initialItems, applyNewItems]);

  // SSR/ISR 캐시가 비었거나 stale일 수 있어, 마운트 시 클라이언트에서 현재 치지직 라이브를
  // 한 번 보정 조회한다. (백엔드는 14개 반환해도 SSR 캐시 때문에 "없음"으로 보이던 문제 방지)
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/streamers/live?platform=chzzk&minViewers=0`,
        );
        const data = (await res.json()) as LiveItem[];
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          applyNewItems(data);
        }
      } catch {
        // best-effort 보정
      }
    })();
    return () => {
      cancelled = true;
    };
    // applyNewItems는 참조가 안정적(useCallback deps: [])이라 여기 넣어도 마운트 시
    // 1회만 실행된다 (초기 플랫폼은 chzzk).
  }, [applyNewItems]);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    setRefreshSpin(true);
    try {
      const res = await fetch(
        `/api/streamers/live?platform=${platform}&minViewers=0`,
      );
      const data = (await res.json()) as LiveItem[];
      applyNewItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("새로고침 실패:", error);
    } finally {
      setIsRefreshing(false);
      setRefreshSpin(false);
    }
  }, [platform, applyNewItems]);

  const handlePlatformChange = React.useCallback(
    async (newPlatform: LivePlatform) => {
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
        const res = await fetch(
          `/api/streamers/live?platform=${newPlatform}&minViewers=0`,
        );
        const data = (await res.json()) as LiveItem[];
        applyNewItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("플랫폼 전환 실패:", error);
      } finally {
        setIsRefreshing(false);
      }
    },
    [applyNewItems],
  );

  const handleImageError = (channelId: string) => {
    setFailedImages((prev) => new Set([...prev, channelId]));
  };

  const handleImageLoad = (channelId: string) => {
    setLoadedImages((prev) => new Set([...prev, channelId]));
  };

  const handleClick = (item: LiveItem) => {
    gaEvent("click_live", {
      platform,
      label: item.channelName,
      value: item.viewerCount,
    });
    // 스트림 클릭 텔레메트리 — 모니터링 "스트림 클릭 타임라인"에 집계
    // (기존 youtube-click 인프라 재활용: videoId 자리에 channelId)
    try {
      const payload = JSON.stringify({
        type: "youtube-click",
        videoId: item.channelId,
        videoTitle: item.title,
        channelTitle: item.channelName,
      });
      const blob = new Blob([payload], { type: "application/json" });
      if (!navigator.sendBeacon("/api/telemetry", blob)) {
        void fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // best-effort telemetry
    }
    window.open(item.liveUrl, "_blank");
  };

  // 토글 버튼 섹션을 메모이제이션 (displayItems 변경 시 재렌더링 방지)
  const controlsBar = React.useMemo(
    () => (
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          🎮 라이브
        </h2>
        <div className="flex items-center gap-1">
          <div className="flex bg-slate-200 dark:bg-slate-700 rounded p-0.5">
            <button
              onClick={() => handlePlatformChange("chzzk")}
              disabled={isRefreshing}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                platform === "chzzk"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              aria-label="치지직 라이브"
            >
              치지직
            </button>
            <button
              onClick={() => handlePlatformChange("youtube")}
              disabled={isRefreshing}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                platform === "youtube"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
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
              className={refreshSpin ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            새로고침
          </button>
        </div>
      </div>
    ),
    [platform, isRefreshing, refreshSpin, handlePlatformChange, handleRefresh],
  );

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
                        ? "youtube-card-enter"
                        : "opacity-0"
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
                        ? "youtube-card-enter"
                        : "opacity-0"
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
