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
    classes: ["도화가", "기상술사", "환수사", "가디언나이트"],
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
  가디언나이트: "bg-pink-100 text-pink-700",
};

export default function ClassSummaryList({ summaries }: Props) {
  const [activeTab, setActiveTab] = useState<string>("전체");

  const tab = TABS.find((t) => t.label === activeTab)!;
  const filtered = tab.classes
    ? summaries.filter((s) =>
        (tab.classes as readonly string[]).includes(s.className),
      )
    : summaries;

  return (
    <section className="flex max-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900">AI 직업 한줄평</h2>
      </div>

      {/* 탭 */}
      <div className="shrink-0 flex overflow-x-auto border-b border-slate-100 px-3">
        {TABS.map((t) => {
          const active = activeTab === t.label;
          const color = TAB_COLOR[t.label];
          return (
            <button
              key={t.label}
              onClick={() => setActiveTab(t.label)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? `${color.text} ${color.border}`
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="stagger flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            데이터 집계 중…
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((s) => (
              <li
                key={s.className}
                className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CLASS_GROUP[s.className] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {s.className}
                </span>
                <p className="text-sm leading-snug text-slate-700">
                  {s.summary}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
