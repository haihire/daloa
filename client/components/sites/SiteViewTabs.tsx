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
}

const TAB_BASE =
  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const TAB_IDLE =
  "border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-cyan-700 dark:hover:text-cyan-300";
const TAB_ACTIVE = "border-cyan-600 bg-cyan-600 text-white";
const TAB_DROP = "border-blue-500 bg-blue-100 text-blue-800 ring-2 ring-blue-400 dark:bg-blue-900 dark:text-blue-100";

export default function SiteViewTabs({
  presets,
  activeView,
  draggingHref,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropSite,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
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

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/70 px-3 py-2 dark:border-slate-700/70">
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
        className={`${TAB_BASE} ${activeView === VIEW_FAVORITES ? TAB_ACTIVE : TAB_IDLE}`}
      >
        ★ 즐겨찾기
      </button>

      {presets.map((preset) => {
        const view = presetView(preset.id);
        const isActive = activeView === view;
        const isDropTarget = dropTargetId === preset.id;

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
          <span
            key={preset.id}
            // 사이트 카드를 이 탭 위로 끌고 오면 프리셋에 담는다.
            onDragOver={(e) => {
              if (!draggingHref) return;
              e.preventDefault();
              e.stopPropagation();
              setDropTargetId(preset.id);
            }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={(e) => {
              if (!draggingHref) return;
              e.preventDefault();
              e.stopPropagation();
              onDropSite(preset.id, draggingHref);
              setDropTargetId(null);
            }}
            className={`${TAB_BASE} inline-flex items-center gap-1 ${
              isDropTarget ? TAB_DROP : isActive ? TAB_ACTIVE : TAB_IDLE
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(view)}
              onDoubleClick={() => startRename(preset)}
              title="더블클릭하면 이름을 바꿉니다"
            >
              {preset.name}
            </button>
            <span className="opacity-60">{preset.hrefs.length}</span>
            {isActive && (
              <>
                <button
                  type="button"
                  aria-label={`${preset.name} 이름 변경`}
                  onClick={() => startRename(preset)}
                  className="opacity-80 hover:opacity-100"
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`${preset.name} 삭제`}
                  onClick={() => onDelete(preset.id)}
                  className="opacity-80 hover:opacity-100"
                >
                  ✕
                </button>
              </>
            )}
          </span>
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
    </div>
  );
}
