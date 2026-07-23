"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { Site } from "@/types";
import { event as gaEvent } from "@/lib/gtag";
import SiteViewTabs from "./SiteViewTabs";
import PresetPicker from "./PresetPicker";
import {
  VIEW_ALL,
  VIEW_FAVORITES,
  createPresetId,
  moveItem,
  normalizePresetName,
  presetIdOf,
  presetView,
  readServerStore,
  readStore,
  saveActiveView,
  saveFavorites,
  savePresets,
  subscribeStore,
  togglePresetMember,
  type ActiveView,
  type Preset,
} from "@/lib/site-presets";

interface Props {
  sites: Site[];
}

// 사이트 주소(도메인)만으로 구글 파비콘 서비스에서 작은 아이콘(32px, ~1-3KB, 7일 캐시)을 받음.
// site.icon에 박힌 원본 대용량 파비콘(예: 256x256)을 16x16로 내려받던 낭비 제거.
function faviconUrl(href: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(href).hostname}&sz=32`;
  } catch {
    return null;
  }
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
  const { favorites, presets, activeView } = useSyncExternalStore(
    subscribeStore,
    readStore,
    readServerStore,
  );

  // 드래그 중에만 쓰는 미리보기 순서. 저장은 드롭 시점에만 하므로,
  // 목록 밖에 놓아 drop 없이 dragend가 오면 null로 되돌아가 원위치된다.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  // 이름 필터 (버튼 없이 입력값으로 즉시 걸러냄)
  const [query, setQuery] = useState("");
  // 드래그 직후 브라우저가 click을 흘리면 사이트가 열려버리므로 한 번 무시한다.
  const justDragged = useRef(false);

  // 저장된 탭이 삭제된 프리셋을 가리키면 전체로 되돌린다.
  const activePresetId = presetIdOf(activeView);
  const activePreset = activePresetId
    ? (presets.find((p) => p.id === activePresetId) ?? null)
    : null;
  const view: ActiveView =
    activePresetId && !activePreset ? VIEW_ALL : activeView;

  // 지금 화면에서 드래그로 순서를 바꿀 수 있는 배열.
  // 프리셋 탭이면 그 프리셋의 순서, 그 외에는 즐겨찾기 순서.
  const baseOrder = activePreset ? activePreset.hrefs : favorites;
  const order = dragOrder ?? baseOrder;
  const favoriteOrder = activePreset ? favorites : order;
  const favSet = new Set(favorites);

  const byHref = new Map(sites.map((site) => [site.href, site]));
  const pickSites = (hrefs: string[]): Site[] =>
    hrefs
      .map((href) => byHref.get(href))
      .filter((site): site is Site => site !== undefined);

  let visible: Site[];
  if (activePreset) {
    visible = pickSites(order);
  } else if (view === VIEW_FAVORITES) {
    visible = pickSites(favoriteOrder);
  } else {
    // 전체: 즐겨찾기가 저장 순서대로 위, 나머지는 원래 서버 순서
    visible = [
      ...pickSites(favoriteOrder),
      ...sites.filter((site) => !favSet.has(site.href)),
    ];
  }

  const persistOrder = (next: string[]) => {
    if (activePreset) {
      savePresets(
        presets.map((p) => (p.id === activePreset.id ? { ...p, hrefs: next } : p)),
      );
    } else {
      saveFavorites(next);
    }
  };

  const toggleFavorite = (href: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyFav = favorites.includes(href);
    const next = isCurrentlyFav
      ? favorites.filter((h) => h !== href) // 해제: 제거
      : [...favorites, href]; // 추가: 맨 뒤에 삽입 (먼저 한 게 상단)
    gaEvent("favorite_toggle", {
      site_name: byHref.get(href)?.name ?? href,
      site_href: href,
      action: isCurrentlyFav ? "remove" : "add",
    });
    saveFavorites(next);
  };

  const createPreset = () => {
    const preset: Preset = {
      id: createPresetId(),
      name: `프리셋${presets.length + 1}`,
      hrefs: [],
    };
    savePresets([...presets, preset]);
    saveActiveView(presetView(preset.id));
    gaEvent("preset_create", { component_name: "site_list" });
  };

  const renamePreset = (id: string, name: string) => {
    savePresets(
      presets.map((p) =>
        p.id === id ? { ...p, name: normalizePresetName(name, p.name) } : p,
      ),
    );
  };

  const deletePreset = (id: string) => {
    const target = presets.find((p) => p.id === id);
    if (!target) return;
    if (!confirm(`'${target.name}' 프리셋을 삭제할까요?`)) return;

    savePresets(presets.filter((p) => p.id !== id));
    saveActiveView(VIEW_ALL);
  };

  const togglePresetSite = (presetId: string, href: string) => {
    savePresets(
      presets.map((p) => (p.id === presetId ? togglePresetMember(p, href) : p)),
    );
  };

  /** 탭 위로 드롭 — 이미 들어있으면 그대로 둔다(토글이 아니라 담기). */
  const addSiteToPreset = (presetId: string, href: string) => {
    const target = presets.find((p) => p.id === presetId);
    if (!target || target.hrefs.includes(href)) return;

    savePresets(
      presets.map((p) =>
        p.id === presetId ? { ...p, hrefs: [...p.hrefs, href] } : p,
      ),
    );
    gaEvent("preset_add_site", { site_href: href });
  };

  const handleDragStart = (href: string, e: React.DragEvent) => {
    setDraggingHref(href);
    justDragged.current = true;
    setDragOrder(baseOrder);
    e.dataTransfer.effectAllowed = "move";
    // Firefox는 데이터가 없으면 드래그를 시작하지 않는다.
    e.dataTransfer.setData("text/plain", href);
  };

  // 순서 대상 안의 다른 카드 위로 들어오면 미리보기 순서를 즉시 바꿔 보여준다.
  const handleDragEnter = (href: string) => {
    if (!draggingHref || draggingHref === href) return;
    setDragOrder((current) => moveItem(current ?? baseOrder, draggingHref, href));
  };

  // 목록 안에 놓았을 때만 저장 확정.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingHref && dragOrder) persistOrder(dragOrder);
  };

  const handleDragEnd = () => {
    setDraggingHref(null);
    setDragOrder(null);
    // click은 dragend 다음 틱에 올 수 있어 바로 내리지 않는다.
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

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

  // 이름 필터 — 공백만이면 전체, 아니면 이름에 포함된 것만 (대소문자 무시)
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? visible.filter((site) =>
        site.name.toLowerCase().includes(normalizedQuery),
      )
    : visible;

  const emptyMessage = normalizedQuery
    ? `‘${query.trim()}’에 해당하는 사이트가 없어요.`
    : activePreset
      ? "이 프리셋이 비어 있어요. 전체 탭에서 사이트를 끌어오거나 ⊕ 버튼으로 담아보세요."
      : "즐겨찾기한 사이트가 없어요. 카드의 ★ 버튼을 눌러 추가해보세요.";

  return (
    <section className="flex max-h-[58vh] flex-col rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur dark:border-slate-700/70 dark:bg-slate-800/80 sm:h-[560px] sm:max-h-none">
      <SiteViewTabs
        presets={presets}
        activeView={view}
        draggingHref={draggingHref}
        onSelect={saveActiveView}
        onCreate={createPreset}
        onRename={renamePreset}
        onDelete={deletePreset}
        onDropSite={addSiteToPreset}
      />

      <div className="border-b border-slate-200/70 px-3 py-2 dark:border-slate-700/70">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="사이트 이름 검색"
          aria-label="사이트 이름 검색"
          className="w-full rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="stagger flex-1 overflow-y-auto rounded-b-2xl px-1 py-3 sm:px-2">
        {filtered.length === 0 && (normalizedQuery !== "" || view !== VIEW_ALL) ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {emptyMessage}
          </p>
        ) : (
          // 목록 전체가 드롭 영역. 여기 밖에서 놓으면 drop이 안 걸려 원위치된다.
          <ul
            className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3"
            onDragOver={(e) => {
              if (draggingHref) e.preventDefault();
            }}
            onDrop={handleDrop}
          >
            {filtered.map((site) => {
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
                    draggable
                    onDragStart={(e) => handleDragStart(site.href, e)}
                    onDragEnter={() => handleDragEnter(site.href)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (justDragged.current) return;
                      trackSiteClick();
                      window.open(site.href, "_blank", "noopener,noreferrer");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        trackSiteClick();
                        window.open(site.href, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className={`relative flex h-full cursor-pointer select-none flex-col rounded-xl border p-2 transition-all duration-200 hover:-translate-y-0.5 sm:p-3 ${
                      isFav
                        ? "border-blue-400 bg-blue-50 hover:border-blue-500 hover:bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700 dark:hover:bg-blue-950/60"
                        : "border-slate-200 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/30"
                    } ${
                      draggingHref === site.href
                        ? "opacity-40 ring-2 ring-blue-400"
                        : ""
                    }`}
                  >
                    {/* 별 + 프리셋 담기 버튼 */}
                    <div className="absolute right-2 top-2 flex items-center gap-0.5">
                      <PresetPicker
                        presets={presets}
                        href={site.href}
                        siteName={site.name}
                        onToggle={togglePresetSite}
                        onCreate={createPreset}
                      />
                      <button
                        type="button"
                        aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        onClick={(e) => toggleFavorite(site.href, e)}
                        className="rounded p-0.5 transition-transform hover:scale-125"
                      >
                        <StarIcon filled={isFav} />
                      </button>
                    </div>

                    <div className="flex items-start justify-between gap-2 pr-12">
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
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        )}
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
                          {site.name}
                        </span>
                      </div>
                      {/* 모바일은 아이콘+이름만 남겨 한 줄로 — 카테고리/설명은 sm부터 */}
                      <span
                        className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs text-white sm:inline-block ${
                          isFav ? "bg-blue-500" : "bg-slate-700 dark:bg-slate-600"
                        }`}
                      >
                        {site.category}
                      </span>
                    </div>
                    <p className="mt-1.5 hidden text-sm text-slate-600 dark:text-slate-400 sm:block">
                      {site.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
