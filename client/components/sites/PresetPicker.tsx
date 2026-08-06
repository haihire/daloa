"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Preset } from "@/lib/site-presets";

interface Props {
  presets: Preset[];
  href: string;
  siteName: string;
  onToggle: (presetId: string, href: string) => void;
  onCreate: () => void;
}

/**
 * 카드마다 붙는 "프리셋에 담기" 버튼.
 * 드래그가 안 되는 터치 기기에서 프리셋을 쓰려면 이 경로가 필요하다.
 *
 * 드롭다운은 document.body에 포탈로 그린다 — 카드 목록 컨테이너가 overflow-y-auto라
 * 카드 안에 그대로 두면(absolute) 목록 경계에서 잘리거나, 옆/아래 카드의 스택 순서에
 * 가려 안 보이는 문제가 있었다. 포탈이면 어떤 조상의 overflow/스태킹 컨텍스트와도
 * 무관하게 항상 최상단에 그려진다.
 */
export default function PresetPicker({
  presets,
  href,
  siteName,
  onToggle,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const isInside = (target: Node) =>
      buttonRef.current?.contains(target) || menuRef.current?.contains(target);

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!isInside(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // 목록이 스크롤되면 버튼 기준으로 계산해둔 좌표가 어긋나므로, 재계산 대신 그냥 닫는다.
    const onScroll = () => setOpen(false);

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const inSomePreset = presets.some((p) => p.hrefs.includes(href));

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${siteName} 프리셋에 담기`}
        aria-expanded={open}
        onClick={(e) => {
          // 카드 클릭(사이트 열기)으로 번지지 않게 한다
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        className={`rounded p-0.5 text-sm leading-none transition-transform hover:scale-125 ${
          inSomePreset
            ? "text-cyan-600 dark:text-cyan-400"
            : "text-slate-400 dark:text-slate-500"
        }`}
      >
        ⊕
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-50 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
          >
            {presets.length === 0 ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCreate();
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-cyan-700 hover:bg-slate-100 dark:text-cyan-300 dark:hover:bg-slate-700"
              >
                + 프리셋 만들기
              </button>
            ) : (
              presets.map((preset) => {
                const included = preset.hrefs.includes(href);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={included}
                    onClick={() => onToggle(preset.id, href)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {/* 체크 상태는 aria-checked가 전달한다. 이름에 섞이지 않게 숨김 */}
                    <span
                      aria-hidden="true"
                      className="w-3 shrink-0 text-cyan-600 dark:text-cyan-400"
                    >
                      {included ? "✓" : ""}
                    </span>
                    <span className="truncate">{preset.name}</span>
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
