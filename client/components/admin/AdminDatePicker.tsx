"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 어드민용 커스텀 날짜 선택기 (네이티브 input 대체).
 * - 일 → 월 → 년 드릴다운: 헤더("YYYY년 M월") 클릭 시 년 목록, 년 클릭 시 월,
 *   월 뷰의 년도 헤더를 다시 클릭하면 달력(일 뷰)으로 닫힌다.
 * - min/max 범위 밖 날짜는 비활성(선택 불가).
 * - 외부 클릭 시 팝업 닫힘.
 */

type View = "day" | "month" | "year";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const firstWeekday = (y: number, m: number) => new Date(y, m - 1, 1).getDay();

function parse(value: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return { y: +match[1], m: +match[2], d: +match[3] };
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

export default function AdminDatePicker({ value, onChange, min, max }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("day");
  const sel = parse(value);
  const [viewYear, setViewYear] = useState(sel.y);
  const [viewMonth, setViewMonth] = useState(sel.m);
  const rootRef = useRef<HTMLDivElement>(null);

  // 팝업 열 때 선택값 기준으로 보기 위치 초기화 + 일 뷰부터 시작
  const openPicker = () => {
    const p = parse(value);
    setViewYear(p.y);
    setViewMonth(p.m);
    setView("day");
    setOpen(true);
  };

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // [start, end] 구간이 [min, max]와 전혀 안 겹치면 비활성.
  // (하루라도 범위에 걸치면 활성 — 끝점만 보면 안 됨)
  const intervalDisabled = (start: string, end: string) =>
    (min != null && min !== "" && end < min) ||
    (max != null && max !== "" && start > max);
  const dayDisabled = (ds: string) => intervalDisabled(ds, ds);
  const monthDisabled = (y: number, m: number) =>
    intervalDisabled(fmt(y, m, 1), fmt(y, m, daysInMonth(y, m)));
  const yearDisabled = (y: number) =>
    intervalDisabled(`${y}-01-01`, `${y}-12-31`);

  const minY = min && min !== "" ? +min.slice(0, 4) : viewYear - 6;
  const maxY = max && max !== "" ? +max.slice(0, 4) : viewYear + 5;
  const years: number[] = [];
  for (let y = minY; y <= maxY; y += 1) years.push(y);

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };

  const cellBase =
    "h-7 w-7 rounded text-xs grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed";
  const pickBase =
    "rounded px-2 py-1.5 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700";

  const leadingBlanks = firstWeekday(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        {value || "날짜 선택"}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {/* 헤더 */}
          <div className="mb-1 flex items-center justify-between">
            {view === "day" && (
              <>
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="rounded px-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label="이전 달"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setView("year")}
                  className="rounded px-2 py-0.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {viewYear}년 {viewMonth}월
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="rounded px-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label="다음 달"
                >
                  ›
                </button>
              </>
            )}
            {view === "month" && (
              <button
                type="button"
                // 월 뷰의 년도 헤더를 다시 누르면 달력(일 뷰)으로 닫힘
                onClick={() => setView("day")}
                className="mx-auto rounded px-2 py-0.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {viewYear}년
              </button>
            )}
            {view === "year" && (
              <span className="mx-auto px-2 py-0.5 text-xs font-semibold text-slate-500">
                년도 선택
              </span>
            )}
          </div>

          {/* 일 뷰 */}
          {view === "day" && (
            <>
              <div className="mb-1 grid grid-cols-7">
                {WEEKDAYS.map((w, i) => (
                  <div
                    key={w}
                    className={`grid h-6 place-items-center text-[10px] ${
                      i === 0
                        ? "text-rose-500"
                        : i === 6
                          ? "text-blue-500"
                          : "text-slate-400"
                    }`}
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {Array.from({ length: leadingBlanks }).map((_, i) => (
                  <div key={`b${i}`} />
                ))}
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
                  const ds = fmt(viewYear, viewMonth, d);
                  const selected = ds === value;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={dayDisabled(ds)}
                      onClick={() => {
                        onChange(ds);
                        setOpen(false);
                      }}
                      className={`${cellBase} mx-auto ${
                        selected
                          ? "bg-blue-600 text-white"
                          : "hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* 월 뷰 */}
          {view === "month" && (
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={monthDisabled(viewYear, m)}
                  onClick={() => {
                    setViewMonth(m);
                    setView("day");
                  }}
                  className={`${pickBase} ${
                    m === viewMonth ? "bg-blue-600 text-white hover:bg-blue-600" : ""
                  }`}
                >
                  {m}월
                </button>
              ))}
            </div>
          )}

          {/* 년 뷰 */}
          {view === "year" && (
            <div className="grid max-h-40 grid-cols-3 gap-1 overflow-y-auto">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  disabled={yearDisabled(y)}
                  onClick={() => {
                    setViewYear(y);
                    setView("month");
                  }}
                  className={`${pickBase} ${
                    y === viewYear ? "bg-blue-600 text-white hover:bg-blue-600" : ""
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
