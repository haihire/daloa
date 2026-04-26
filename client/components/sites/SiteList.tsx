"use client";

import { useSyncExternalStore } from "react";
import type { Site } from "@/types";

interface Props {
  sites: Site[];
}

const STORAGE_KEY = "loa_favorites";
const FAVORITES_EVENT = "loa_favorites_changed";
const EMPTY_FAVORITES: string[] = [];

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
    const next = favorites.includes(href)
      ? favorites.filter((h) => h !== href) // 해제: 제거
      : [...favorites, href]; // 추가: 맨 뒤에 삽입 (먼저 한 게 상단)
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

  return (
    <section className="flex max-h-[56vh] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur sm:h-[590px] sm:max-h-none">
      <div className="stagger flex-1 overflow-y-auto p-4 pr-5 sm:pr-4">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((site) => {
            const isFav = favSet.has(site.href);
            return (
              <li key={site.href}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    window.open(site.href, "_blank", "noopener,noreferrer")
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    window.open(site.href, "_blank", "noopener,noreferrer")
                  }
                  className={`relative flex h-full cursor-pointer select-none flex-col rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 ${
                    isFav
                      ? "border-blue-400 bg-blue-50 hover:border-blue-500 hover:bg-blue-50"
                      : "border-slate-200 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50"
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
                      {site.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={site.icon}
                          alt=""
                          width={16}
                          height={16}
                          className="shrink-0 rounded-sm"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            const domain = (() => {
                              try {
                                return new URL(site.href).hostname;
                              } catch {
                                return "";
                              }
                            })();
                            const fallback = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                            if (img.src !== fallback && domain) {
                              img.src = fallback;
                            } else {
                              img.style.display = "none";
                            }
                          }}
                        />
                      )}
                      <span className="truncate font-semibold text-slate-900">
                        {site.name}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs text-white ${
                        isFav ? "bg-blue-500" : "bg-slate-900"
                      }`}
                    >
                      {site.category}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">
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
