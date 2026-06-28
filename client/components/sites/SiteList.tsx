"use client";

import { useSyncExternalStore } from "react";
import type { Site } from "@/types";
import { event as gaEvent } from "@/lib/gtag";

interface Props {
  sites: Site[];
}

const STORAGE_KEY = "loa_favorites";
const FAVORITES_EVENT = "loa_favorites_changed";
const EMPTY_FAVORITES: string[] = [];

// 사이트 주소(도메인)만으로 구글 파비콘 서비스에서 작은 아이콘(32px, ~1-3KB, 7일 캐시)을 받음.
// site.icon에 박힌 원본 대용량 파비콘(예: 256x256)을 16x16로 내려받던 낭비 제거.
function faviconUrl(href: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(href).hostname}&sz=32`;
  } catch {
    return null;
  }
}

let cachedRawFavorites: string | null = null;
let cachedParsedFavorites: string[] = EMPTY_FAVORITES;

function readFavorites(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      cachedRawFavorites = null;
      cachedParsedFavorites = EMPTY_FAVORITES;
      return cachedParsedFavorites;
    }

    if (stored === cachedRawFavorites) {
      return cachedParsedFavorites;
    }

    const parsed = JSON.parse(stored) as string[];
    cachedRawFavorites = stored;
    cachedParsedFavorites = Array.isArray(parsed) ? parsed : EMPTY_FAVORITES;
    return cachedParsedFavorites;
  } catch {
    cachedRawFavorites = null;
    cachedParsedFavorites = EMPTY_FAVORITES;
    return cachedParsedFavorites;
  }
}

function subscribeFavorites(onStoreChange: () => void): () => void {
  const onStorage = (event: Event) => {
    if (event instanceof StorageEvent) {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
    }
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(FAVORITES_EVENT, onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(FAVORITES_EVENT, onStorage);
  };
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill={filled ? "#f59e0b" : "none"}
      stroke={filled ? "#f59e0b" : "#94a3b8"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function SiteList({ sites }: Props) {
  // SSR/CSR 초기 스냅샷을 일치시켜 hydration mismatch를 방지한다.
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    readFavorites,
    () => EMPTY_FAVORITES,
  );

  const toggleFavorite = (href: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyFav = favorites.includes(href);
    const next = isCurrentlyFav
      ? favorites.filter((h) => h !== href) // 해제: 제거
      : [...favorites, href]; // 추가: 맨 뒤에 삽입 (먼저 한 게 상단)
    const site = sites.find((s) => s.href === href);
    gaEvent("favorite_toggle", {
      site_name: site?.name ?? href,
      site_href: href,
      action: isCurrentlyFav ? "remove" : "add",
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(FAVORITES_EVENT));
    } catch {
      // ignore
    }
  };

  const favSet = new Set(favorites);
  // 즐겨찾기: 추가 순서대로 상단 / 나머지: 원래 서버 순서
  const sorted = [
    ...favorites
      .map((href) => sites.find((s) => s.href === href))
      .filter((s): s is Site => s !== undefined),
    ...sites.filter((s) => !favSet.has(s.href)),
  ];

  // 클릭수(인기도) 기준 순위 맵 — 클릭수가 1 이상인 사이트만 순위 부여(수치는 표시 안 함)
  const rankMap = new Map<string, number>();
  [...sites]
    .sort((a, b) => (b.clickCount ?? 0) - (a.clickCount ?? 0))
    .forEach((s, i) => {
      if ((s.clickCount ?? 0) > 0) rankMap.set(s.href, i + 1);
    });

  const detectDeviceType = (): "mobile" | "desktop" | "tablet" | "bot" | "unknown" => {
    const ua = navigator.userAgent.toLowerCase();
    if (/bot|crawler|spider|crawling/.test(ua)) return "bot";
    if (/ipad|tablet/.test(ua)) return "tablet";
    if (/mobi|android|iphone/.test(ua)) return "mobile";
    if (ua.length > 0) return "desktop";
    return "unknown";
  };

  return (
    <section className="flex max-h-[58vh] flex-col rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur dark:border-slate-700/70 dark:bg-slate-800/80 sm:h-[560px] sm:max-h-none">
      <div className="stagger flex-1 overflow-y-auto rounded-2xl px-1 py-3 sm:px-2">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((site) => {
            const isFav = favSet.has(site.href);
            const favicon = faviconUrl(site.href); // 사이트당 1회만 파싱
            const rank = rankMap.get(site.href); // 클릭수 기준 순위 (없으면 미표시)
            const trackSiteClick = () => {
              const payload = {
                type: "site-click",
                siteName: site.name,
                siteHref: site.href,
                siteCategory: site.category,
                deviceType: detectDeviceType(),
              };
              gaEvent("site_click", {
                site_name: site.name,
                site_category: site.category,
                site_href: site.href,
              });
              gaEvent("component_click", {
                component_name: "site_list",
                item_name: site.name,
                item_id: site.href,
              });
              try {
                const body = JSON.stringify(payload);
                const beacon = navigator.sendBeacon(
                  "/api/telemetry",
                  new Blob([body], { type: "application/json" }),
                );
                if (!beacon) {
                  void fetch("/api/telemetry", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                    keepalive: true,
                  }).catch(() => {
                    // best-effort telemetry
                  });
                }
              } catch {
                void fetch("/api/telemetry", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                  keepalive: true,
                }).catch(() => {
                  // best-effort telemetry
                });
              }
            };

            return (
              <li key={site.href}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    trackSiteClick();
                    window.open(site.href, "_blank", "noopener,noreferrer");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      trackSiteClick();
                      window.open(site.href, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className={`relative flex h-full cursor-pointer select-none flex-col rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 ${
                    isFav
                      ? "border-blue-400 bg-blue-50 hover:border-blue-500 hover:bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700 dark:hover:bg-blue-950/60"
                      : "border-slate-200 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/30"
                  }`}
                >
                  {/* 별 버튼 */}
                  <button
                    type="button"
                    aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    onClick={(e) => toggleFavorite(site.href, e)}
                    className="absolute right-2 top-2 rounded p-0.5 transition-transform hover:scale-125"
                  >
                    <StarIcon filled={isFav} />
                  </button>

                  <div className="flex items-start justify-between gap-2 pr-5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {rank && (
                        <span
                          className={`flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 text-[10px] font-bold leading-none ${
                            rank === 1
                              ? "bg-amber-400 text-amber-950"
                              : rank === 2
                                ? "bg-slate-300 text-slate-700"
                                : rank === 3
                                  ? "bg-orange-400 text-orange-950"
                                  : "bg-slate-200 text-slate-500 dark:bg-slate-600 dark:text-slate-300"
                          }`}
                          aria-label={`인기 순위 ${rank}위`}
                        >
                          {rank}
                        </span>
                      )}
                      {favicon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={favicon}
                          alt=""
                          width={16}
                          height={16}
                          loading="lazy"
                          decoding="async"
                          className="shrink-0 rounded-sm"
                          onError={(e) => {
                            // 구글 파비콘도 못 찾으면 아이콘 숨김
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {site.name}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs text-white ${
                        isFav ? "bg-blue-500" : "bg-slate-700 dark:bg-slate-600"
                      }`}
                    >
                      {site.category}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    {site.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
