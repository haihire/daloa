"use client";

import { useState } from "react";
import type { StatBuildTab } from "@/types";

interface Props {
  tabs: StatBuildTab[];
}

const BUILD_STYLE: Record<string, { tab: string; bar: string }> = {
  치신: {
    tab: "bg-red-500 text-white",
    bar: "bg-red-400",
  },
  신치: {
    tab: "bg-blue-500 text-white",
    bar: "bg-blue-400",
  },
  치특: {
    tab: "bg-orange-500 text-white",
    bar: "bg-orange-400",
  },
  특치: {
    tab: "bg-amber-500 text-white",
    bar: "bg-amber-400",
  },
  신특: {
    tab: "bg-indigo-500 text-white",
    bar: "bg-indigo-400",
  },
  특신: {
    tab: "bg-purple-500 text-white",
    bar: "bg-purple-400",
  },
  치특신: {
    tab: "bg-cyan-500 text-white",
    bar: "bg-cyan-400",
  },
  미설정: {
    tab: "bg-slate-400 text-white",
    bar: "bg-slate-300",
  },
};
const DEFAULT_STYLE = BUILD_STYLE["미설정"];

export default function StatBuildList({ tabs }: Props) {
  const safeTabs = Array.isArray(tabs)
    ? tabs.map((t) => ({ ...t, statBuild: t.statBuild.trim() }))
    : [];

  const defaultTab =
    safeTabs.find((t) => t.statBuild === "치신")?.statBuild ??
    safeTabs[0]?.statBuild ??
    "";

  const [activeTab, setActiveTab] = useState(defaultTab);

  const current =
    safeTabs.find((t) => t.statBuild === activeTab) ?? safeTabs[0];
  const maxCount = Math.max(...(current?.items?.map((i) => i.count) ?? [1]), 1);

  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white/85 p-4 shadow-md backdrop-blur fade-in delay-1">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">
          Stat Builds
        </p>
        <h2 className="text-xl font-semibold text-slate-900">특성 빌드 분포</h2>
      </div>

      {/* 탭 버튼 */}
      <div className="mb-4 flex flex-wrap gap-1">
        {safeTabs.map((tab) => {
          const style = BUILD_STYLE[tab.statBuild] ?? DEFAULT_STYLE;
          const isActive = tab.statBuild === activeTab;
          return (
            <button
              type="button"
              key={tab.statBuild}
              onClick={() => setActiveTab(tab.statBuild)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
                isActive
                  ? style.tab
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tab.statBuild}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  isActive ? "bg-white/30" : "bg-slate-100 text-slate-400"
                }`}
              >
                {tab.totalCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 탭 직업 순위 */}
      <ul className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent]">
        {current?.items?.map((item, idx) => {
          const style = BUILD_STYLE[activeTab] ?? DEFAULT_STYLE;
          return (
            <li
              key={`${item.classDetail}-${idx}`}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {item.classDetail}
                    </span>
                    {item.classEngraving && (
                      <span className="text-xs text-slate-400">
                        {item.classEngraving}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-600">
                  {item.count}명
                </span>
              </div>

              <div className="ml-7 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${style.bar}`}
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs text-slate-400">
                  {Math.round((item.count / maxCount) * 100)}%
                </span>
              </div>
            </li>
          );
        })}

        {(!current || !current.items?.length) && (
          <li className="py-8 text-center text-sm text-slate-400">
            스탯 데이터 없음
          </li>
        )}
      </ul>
    </article>
  );
}
