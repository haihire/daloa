"use client";

import { useState } from "react";
import type { ClassSummary } from "@/types";

interface Props {
  summaries: ClassSummary[];
}

const TABS = [
  { label: "전체", classes: null },
  {
    label: "전사",
    classes: [
      "워로드",
      "버서커",
      "디스트로이어",
      "슬레이어",
      "홀리나이트",
      "발키리",
    ],
  },
  {
    label: "무도가",
    classes: [
      "스트라이커",
      "배틀마스터",
      "인파이터",
      "기공사",
      "창술사",
      "브레이커",
    ],
  },
  {
    label: "헌터",
    classes: ["데빌헌터", "블래스터", "호크아이", "스카우터", "건슬링어"],
  },
  { label: "마법사", classes: ["소서리스", "아르카나", "서머너", "바드"] },
  { label: "암살자", classes: ["블레이드", "데모닉", "리퍼", "소울이터"] },
  {
    label: "스페셜",
    classes: ["도화가", "기상술사", "환수사"],
  },
  {
    label: "오리지널",
    classes: ["가디언나이트"],
  },
] as const;

const TAB_COLOR: Record<string, { text: string; border: string }> = {
  전체: { text: "text-slate-700", border: "border-slate-600" },
  전사: { text: "text-red-500", border: "border-red-500" },
  무도가: { text: "text-orange-500", border: "border-orange-500" },
  헌터: { text: "text-green-600", border: "border-green-600" },
  마법사: { text: "text-blue-500", border: "border-blue-500" },
  암살자: { text: "text-purple-500", border: "border-purple-500" },
  스페셜: { text: "text-pink-500", border: "border-pink-500" },
  오리지널: { text: "text-yellow-600", border: "border-yellow-500" },
};

// 직업군별 구분을 위한 색상 매핑
const CLASS_GROUP: Record<string, string> = {
  // 전사
  워로드: "bg-red-100 text-red-700",
  버서커: "bg-red-100 text-red-700",
  디스트로이어: "bg-red-100 text-red-700",
  슬레이어: "bg-red-100 text-red-700",
  홀리나이트: "bg-red-100 text-red-700",
  발키리: "bg-red-100 text-red-700",
  // 무도가
  스트라이커: "bg-orange-100 text-orange-700",
  배틀마스터: "bg-orange-100 text-orange-700",
  인파이터: "bg-orange-100 text-orange-700",
  기공사: "bg-orange-100 text-orange-700",
  창술사: "bg-orange-100 text-orange-700",
  브레이커: "bg-orange-100 text-orange-700",
  // 헌터
  데빌헌터: "bg-green-100 text-green-700",
  블래스터: "bg-green-100 text-green-700",
  호크아이: "bg-green-100 text-green-700",
  스카우터: "bg-green-100 text-green-700",
  건슬링어: "bg-green-100 text-green-700",
  // 마법사
  소서리스: "bg-blue-100 text-blue-700",
  아르카나: "bg-blue-100 text-blue-700",
  서머너: "bg-blue-100 text-blue-700",
  바드: "bg-blue-100 text-blue-700",
  // 암살자
  블레이드: "bg-purple-100 text-purple-700",
  데모닉: "bg-purple-100 text-purple-700",
  리퍼: "bg-purple-100 text-purple-700",
  소울이터: "bg-purple-100 text-purple-700",
  // 스페셜리스트
  도화가: "bg-pink-100 text-pink-700",
  기상술사: "bg-pink-100 text-pink-700",
  환수사: "bg-pink-100 text-pink-700",
  // 오리지널
  가디언나이트: "bg-yellow-100 text-yellow-700",
};

export default function ClassSummaryList({ summaries }: Props) {
  const [activeTab, setActiveTab] = useState<string>("전체");
  const [query, setQuery] = useState("");

  const tab = TABS.find((t) => t.label === activeTab)!;
  const tabFiltered = tab.classes
    ? summaries.filter((s) =>
        (tab.classes as readonly string[]).includes(s.className),
      )
    : summaries;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? summaries.filter((s) => s.className.toLowerCase().includes(q))
    : tabFiltered;

  return (
    <section className="flex h-[calc((100vh-90px)/3)] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur">
      {/* 헤더 */}
      <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-4 py-3 gap-3">
        <h2 className="text-lg font-semibold text-slate-900 shrink-0">
          AI 직업 한줄평
        </h2>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="직업 검색"
          className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 outline-none placeholder:text-slate-300 focus:border-cyan-400 focus:bg-white transition"
        />
      </div>

      {/* 본문: 왼쪽 분류 탭 + 오른쪽 직업 목록 */}
      <div className="flex flex-1 min-h-0">
        {/* 왼쪽 분류 탭 */}
        <ul className="shrink-0 flex flex-col border-r border-slate-100 py-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent]">
          {TABS.map((t) => {
            const active = activeTab === t.label && !q;
            const color = TAB_COLOR[t.label];
            return (
              <li key={t.label}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(t.label);
                    setQuery("");
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-semibold whitespace-nowrap transition-colors border-r-2 ${
                    active
                      ? `${color.text} border-current bg-slate-50`
                      : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>

        {/* 오른쪽 직업 + 한줄평 목록 */}
        <ul className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent]">
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-400">
              데이터 집계 중…
            </li>
          ) : (
            filtered.map((s) => (
              <li
                key={s.className}
                className="flex flex-col items-start gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CLASS_GROUP[s.className] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {s.className}
                </span>
                <p className="pl-2 text-xs leading-snug text-slate-700">
                  {s.summary}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
