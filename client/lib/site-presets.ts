"use client";

/**
 * 사이트 목록의 개인화 상태(즐겨찾기 / 프리셋 / 마지막으로 본 탭)를 localStorage에 보관한다.
 * 계정 기능이 없는 사이트라 서버에 저장하지 않는다 — 브라우저별로만 유지된다.
 */

export const FAVORITES_KEY = "loa_favorites";
export const PRESETS_KEY = "loa_presets";
export const ACTIVE_VIEW_KEY = "loa_active_view";
/** 같은 탭 안의 다른 컴포넌트에 변경을 알리는 이벤트 (storage 이벤트는 다른 탭에만 간다) */
export const STORE_EVENT = "loa_sites_store_changed";

export const MAX_PRESET_NAME_LENGTH = 12;

export interface Preset {
  id: string;
  name: string;
  hrefs: string[];
}

/** "all" | "favorites" | "preset:<id>" */
export type ActiveView = string;

export const VIEW_ALL = "all";
export const VIEW_FAVORITES = "favorites";

export function presetView(id: string): ActiveView {
  return `preset:${id}`;
}

export function presetIdOf(view: ActiveView): string | null {
  return view.startsWith("preset:") ? view.slice("preset:".length) : null;
}

export interface SitesStoreState {
  favorites: string[];
  presets: Preset[];
  activeView: ActiveView;
}

const EMPTY_STATE: SitesStoreState = {
  favorites: [],
  presets: [],
  activeView: VIEW_ALL,
};

// useSyncExternalStore는 값이 그대로면 같은 객체 참조를 돌려받아야 무한 렌더를 피한다.
// 원본 문자열을 기억해 두고 바뀐 경우에만 새 스냅샷을 만든다.
let cachedRaw: { favorites: string; presets: string; view: string } | null =
  null;
let cachedState: SitesStoreState = EMPTY_STATE;

function parseHrefs(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function parsePresets(raw: string): Preset[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): Preset[] => {
      if (typeof item !== "object" || item === null) return [];
      const { id, name, hrefs } = item as Partial<Preset>;
      if (typeof id !== "string" || typeof name !== "string") return [];
      return [
        {
          id,
          name,
          hrefs: Array.isArray(hrefs)
            ? hrefs.filter((v): v is string => typeof v === "string")
            : [],
        },
      ];
    });
  } catch {
    return [];
  }
}

export function readStore(): SitesStoreState {
  try {
    const favorites = localStorage.getItem(FAVORITES_KEY) ?? "";
    const presets = localStorage.getItem(PRESETS_KEY) ?? "";
    const view = localStorage.getItem(ACTIVE_VIEW_KEY) ?? "";

    if (
      cachedRaw &&
      cachedRaw.favorites === favorites &&
      cachedRaw.presets === presets &&
      cachedRaw.view === view
    ) {
      return cachedState;
    }

    cachedRaw = { favorites, presets, view };
    cachedState = {
      favorites: parseHrefs(favorites),
      presets: parsePresets(presets),
      activeView: view || VIEW_ALL,
    };
    return cachedState;
  } catch {
    return EMPTY_STATE;
  }
}

/** SSR 스냅샷 — hydration mismatch를 막기 위해 항상 같은 참조를 돌려준다. */
export function readServerStore(): SitesStoreState {
  return EMPTY_STATE;
}

export function subscribeStore(onStoreChange: () => void): () => void {
  const handler = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== null) {
      const watched = [FAVORITES_KEY, PRESETS_KEY, ACTIVE_VIEW_KEY];
      if (!watched.includes(event.key)) return;
    }
    onStoreChange();
  };

  window.addEventListener("storage", handler);
  window.addEventListener(STORE_EVENT, handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(STORE_EVENT, handler);
  };
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch {
    // 저장 실패(사파리 프라이빗 모드 등)해도 화면은 계속 동작해야 한다
  }
}

export function saveFavorites(next: string[]): void {
  write(FAVORITES_KEY, JSON.stringify(next));
}

export function savePresets(next: Preset[]): void {
  write(PRESETS_KEY, JSON.stringify(next));
}

export function saveActiveView(next: ActiveView): void {
  write(ACTIVE_VIEW_KEY, next);
}

export function createPresetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** 이름 없는 프리셋이 생기지 않도록 비면 기본 이름을 준다. */
export function normalizePresetName(raw: string, fallback: string): string {
  const trimmed = raw.trim().slice(0, MAX_PRESET_NAME_LENGTH);
  return trimmed || fallback;
}

/** from을 빼서 to 자리에 끼워넣은 새 배열. 둘 중 하나라도 없으면 원본 그대로. */
export function moveItem(order: string[], from: string, to: string): string[] {
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return order;

  const next = [...order];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}

export function togglePresetMember(preset: Preset, href: string): Preset {
  const has = preset.hrefs.includes(href);
  return {
    ...preset,
    hrefs: has
      ? preset.hrefs.filter((h) => h !== href)
      : [...preset.hrefs, href],
  };
}
