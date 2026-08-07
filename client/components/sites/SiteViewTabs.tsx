"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_PRESET_NAME_LENGTH,
  VIEW_ALL,
  VIEW_FAVORITES,
  presetView,
  type ActiveView,
  type Preset,
} from "@/lib/site-presets";

interface Props {
  presets: Preset[];
  activeView: ActiveView;
  /** 드래그 중인 사이트 href — 있으면 프리셋 탭이 드롭을 받는다 */
  draggingHref: string | null;
  onSelect: (view: ActiveView) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDropSite: (presetId: string, href: string) => void;
  onDropFavorite: (href: string) => void;
}

const TAB_BASE =
  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const TAB_IDLE =
  "border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-cyan-700 dark:hover:text-cyan-300";
const TAB_ACTIVE = "border-cyan-600 bg-cyan-600 text-white";
const TAB_DROP =
  "border-blue-500 bg-blue-100 text-blue-800 ring-2 ring-blue-400 dark:bg-blue-900 dark:text-blue-100";

export default function SiteViewTabs({
  presets,
  activeView,
  draggingHref,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropSite,
  onDropFavorite,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  // 드롭을 받는 중인 탭 — VIEW_FAVORITES 이거나 프리셋 id
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  function startRename(preset: Preset) {
    setEditingId(preset.id);
    setDraftName(preset.name);
  }

  function commitRename() {
    if (editingId) onRename(editingId, draftName);
    setEditingId(null);
  }

  // 지금 보고 있는 프리셋(전체·즐겨찾기면 없음) — 우측 관리 버튼의 대상.
  // 이름 편집 중에는 입력칸이 그 자리를 대신하므로 버튼을 숨긴다.
  const activePreset =
    presets.find(
      (p) => presetView(p.id) === activeView && p.id !== editingId,
    ) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/70 px-3 py-2 dark:border-slate-700/70">
      {/*
        전체 탭만 드롭을 받지 않는다. 모든 사이트가 이미 들어 있는 뷰라 "여기에 담는다"가
        성립하지 않는다 — 즐겨찾기/프리셋에서 카드를 끌어와도 넣을 것이 없다.
        (전체에서 빼는 건 별 버튼과 ⊕ 메뉴가 담당한다.)
      */}
      <button
        type="button"
        onClick={() => onSelect(VIEW_ALL)}
        className={`${TAB_BASE} ${activeView === VIEW_ALL ? TAB_ACTIVE : TAB_IDLE}`}
      >
        전체
      </button>
      <button
        type="button"
        onClick={() => onSelect(VIEW_FAVORITES)}
        onDragOver={(e) => {
          if (!draggingHref) return;
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(VIEW_FAVORITES);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          if (!draggingHref) return;
          e.preventDefault();
          e.stopPropagation();
          onDropFavorite(draggingHref);
          setDropTarget(null);
        }}
        className={`${TAB_BASE} ${
          dropTarget === VIEW_FAVORITES
            ? TAB_DROP
            : activeView === VIEW_FAVORITES
              ? TAB_ACTIVE
              : TAB_IDLE
        }`}
      >
        ★ 즐겨찾기
      </button>

      {presets.map((preset) => {
        const view = presetView(preset.id);
        const isActive = activeView === view;
        const isDropTarget = dropTarget === preset.id;

        if (editingId === preset.id) {
          return (
            <input
              key={preset.id}
              ref={inputRef}
              value={draftName}
              maxLength={MAX_PRESET_NAME_LENGTH}
              aria-label="프리셋 이름"
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="w-24 shrink-0 rounded-full border border-cyan-500 bg-white px-3 py-1 text-xs text-slate-900 outline-none dark:bg-slate-800 dark:text-slate-100"
            />
          );
        }

        return (
          // 알약 전체가 클릭 영역이다. 예전엔 이름 글자만 <button> 이고 좌우 패딩(px-3)과
          // 개수 숫자는 바깥 <span> 소속이라, 알약의 3분의 1 남짓만 실제로 눌렸다.
          // 탭을 빠르게 옮겨 누를수록 조준이 거칠어져 그 죽은 영역에 자주 떨어졌다.
          //
          // 더블클릭 이름 변경도 뺐다. 같은 탭을 연달아 누르면(=안 눌린 것 같아 다시 누르면)
          // 알약이 입력칸으로 바뀌어 그다음 클릭이 텍스트 입력으로 먹혀버렸다.
          // 이름 변경은 우측 버튼이 담당한다.
          <button
            key={preset.id}
            type="button"
            aria-label={preset.name}
            onClick={() => onSelect(view)}
            // 사이트 카드를 이 탭 위로 끌고 오면 프리셋에 담는다.
            onDragOver={(e) => {
              if (!draggingHref) return;
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(preset.id);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              if (!draggingHref) return;
              e.preventDefault();
              e.stopPropagation();
              onDropSite(preset.id, draggingHref);
              setDropTarget(null);
            }}
            className={`${TAB_BASE} inline-flex items-center gap-1 ${
              isDropTarget ? TAB_DROP : isActive ? TAB_ACTIVE : TAB_IDLE
            }`}
          >
            {preset.name}
            <span className="opacity-60">{preset.hrefs.length}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onCreate}
        aria-label="프리셋 추가"
        className={`${TAB_BASE} ${TAB_IDLE}`}
      >
        +
      </button>

      {/*
        선택된 프리셋의 이름 변경·삭제. 예전엔 ✎ ✕ 글리프를 알약 안에 나란히 뒀는데,
        패딩이 없어 클릭 영역이 10px 남짓이고 4px 간격으로 붙어 있어 "이름 변경"을
        누르려다 "삭제"를 누르기 쉬웠다. 알약 밖 우측 끝으로 빼고 글자를 넣어
        무슨 버튼인지 보이게 한다. 삭제는 색으로도 구분.
      */}
      {activePreset && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`${activePreset.name} 이름 변경`}
            onClick={() => startRename(activePreset)}
            className={`${TAB_BASE} ${TAB_IDLE}`}
          >
            이름 변경
          </button>
          <button
            type="button"
            aria-label={`${activePreset.name} 삭제`}
            onClick={() => onDelete(activePreset.id)}
            className={`${TAB_BASE} border-red-200 bg-white text-red-600 hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40`}
          >
            삭제
          </button>
        </span>
      )}
    </div>
  );
}
