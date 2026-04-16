"use client";

import { useState } from "react";
import type { StatBuildTab } from "@/types";

interface Props {
  tabs: StatBuildTab[];
}

const BUILD_STYLE: Record<string, { tab: string; bar: string; bg: string }> = {
  치신: {
    tab: "bg-red-500 text-white",
    bar: "bg-red-400",
    bg: "bg-red-500",
  },
  신치: {
    tab: "bg-blue-500 text-white",
    bar: "bg-blue-400",
    bg: "bg-blue-500",
  },
  치특: {
    tab: "bg-orange-500 text-white",
    bar: "bg-orange-400",
    bg: "bg-orange-500",
  },
  특치: {
    tab: "bg-amber-500 text-white",
    bar: "bg-amber-400",
    bg: "bg-amber-500",
  },
  신특: {
    tab: "bg-indigo-500 text-white",
    bar: "bg-indigo-400",
    bg: "bg-indigo-500",
  },
  특신: {
    tab: "bg-purple-500 text-white",
    bar: "bg-purple-400",
    bg: "bg-purple-500",
  },
  치특신: {
    tab: "bg-cyan-500 text-white",
    bar: "bg-cyan-400",
    bg: "bg-cyan-500",
  },
  미설정: {
    tab: "bg-slate-400 text-white",
    bar: "bg-slate-300",
    bg: "bg-slate-400",
  },
};
const DEFAULT_STYLE = BUILD_STYLE["미설정"];

export default function StatBuildList({ tabs }: Props) {
  const safeTabs = Array.isArray(tabs)
    ? tabs
        .map((t) => ({ ...t, statBuild: t.statBuild.trim() }))
        .sort((a, b) => (b.totalCount ?? 0) - (a.totalCount ?? 0))
    : [];

  const defaultTab = safeTabs[0]?.statBuild ?? "";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [query, setQuery] = useState("");

  const grandTotal = safeTabs.reduce((sum, t) => sum + (t.totalCount ?? 0), 0);

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  // 검색 모드: 매칭 항목이 있는 탭만 그룹으로 수집
  const searchGroups = isSearching
    ? safeTabs
        .map((tab) => {
          const matched = [...(tab.items ?? [])]
            .sort((a, b) => b.count - a.count)
            .filter(
              (item) =>
                item.classEngraving?.toLowerCase().includes(q) ||
                item.classDetail?.toLowerCase().includes(q),
            );
          return { tab, matched };
        })
        .filter((g) => g.matched.length > 0)
    : [];

  // 탭 뷰
  const current =
    safeTabs.find((t) => t.statBuild === activeTab) ?? safeTabs[0];
  const maxCount = Math.max(...(current?.items?.map((i) => i.count) ?? [1]), 1);

  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white/85 p-4 shadow-md backdrop-blur fade-in delay-1">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">
            Stat Builds
          </p>
          <h2 className="text-xl font-semibold text-slate-900">
            특성 빌드 분포
          </h2>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="직업·각인 검색"
          className="mt-1 w-36 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-300 focus:border-cyan-400 focus:bg-white transition"
        />
      </div>

      {isSearching ? (
        /* ── 검색 결과 뷰 ── */
        <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent]">
          {searchGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              검색 결과 없음
            </p>
          ) : (
            searchGroups.map(({ tab, matched }) => {
              const style = BUILD_STYLE[tab.statBuild] ?? DEFAULT_STYLE;
              // 전체 매칭 합산 (모든 탭에 걸친 매칭 결과 총합)
              const matchedTotal = searchGroups.reduce(
                (sum, g) => sum + g.matched.reduce((s, i) => s + i.count, 0),
                0,
              );
              return (
                <div key={tab.statBuild}>
                  {/* 탭 소제목 */}
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${style.tab}`}
                    >
                      {tab.statBuild}
                    </span>
                    <span className="text-xs text-slate-400">
                      {grandTotal > 0
                        ? `전체 ${Math.round((tab.totalCount / grandTotal) * 100)}%`
                        : ""}
                    </span>
                  </div>
                  {/* 매칭 항목 */}
                  <ul className="flex flex-col gap-0.5">
                    {matched.map((item, idx) => {
                      const pct =
                        matchedTotal > 0
                          ? Math.round((item.count / matchedTotal) * 100)
                          : 0;
                      return (
                        <li
                          key={`${item.classDetail}-${idx}`}
                          className="flex items-center gap-2 rounded-lg bg-cyan-50 py-0.5 ring-1 ring-cyan-200"
                        >
                          <span className="w-4 shrink-0 text-center text-xs font-bold text-slate-400" />
                          <div className="flex w-32 shrink-0 flex-col">
                            <span className="truncate text-xs font-semibold leading-tight text-cyan-700">
                              {item.classEngraving}
                            </span>
                            {item.classDetail && (
                              <span className="truncate text-xs font-normal leading-tight text-cyan-500">
                                {item.classDetail}
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-cyan-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs font-semibold text-cyan-600">
                            {pct}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ── 탭 뷰 ── */
        <>
          {/* 스택 프로그레스바 */}
          <div className="mb-2 flex h-5 w-full overflow-hidden rounded-lg">
            {safeTabs.map((tab) => {
              const pct =
                grandTotal > 0 ? (tab.totalCount / grandTotal) * 100 : 0;
              const style = BUILD_STYLE[tab.statBuild] ?? DEFAULT_STYLE;
              const isActive = tab.statBuild === activeTab;
              return (
                <button
                  key={tab.statBuild}
                  type="button"
                  onClick={() => setActiveTab(tab.statBuild)}
                  title={`${tab.statBuild} ${Math.round(pct)}%`}
                  className={`h-full transition-opacity ${style.bg} ${
                    isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
                  }`}
                  style={{
                    width: `${pct}%`,
                    minWidth: pct > 0 ? "4px" : "0",
                  }}
                />
              );
            })}
          </div>

          {/* 범례 */}
          <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1">
            {safeTabs.map((tab) => {
              const pct =
                grandTotal > 0
                  ? Math.round((tab.totalCount / grandTotal) * 100)
                  : 0;
              const style = BUILD_STYLE[tab.statBuild] ?? DEFAULT_STYLE;
              const isActive = tab.statBuild === activeTab;
              return (
                <button
                  key={tab.statBuild}
                  type="button"
                  onClick={() => setActiveTab(tab.statBuild)}
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    isActive
                      ? "font-bold text-slate-800"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.bg}`}
                  />
                  {tab.statBuild}
                  <span
                    className={isActive ? "text-slate-500" : "text-slate-300"}
                  >
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>

          <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent]">
            {[...(current?.items ?? [])]
              .sort((a, b) => b.count - a.count)
              .map((item, idx) => {
                const style = BUILD_STYLE[activeTab] ?? DEFAULT_STYLE;
                return (
                  <li
                    key={`${item.classDetail}-${idx}`}
                    className="flex items-center gap-2 py-0.5"
                  >
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-slate-400">
                      {idx + 1}
                    </span>
                    <div className="flex w-32 shrink-0 flex-col">
                      <span className="truncate text-xs font-semibold leading-tight text-slate-800">
                        {item.classEngraving}
                      </span>
                      {item.classDetail && (
                        <span className="truncate text-xs font-normal leading-tight text-slate-400">
                          {item.classDetail}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${style.bar}`}
                        style={{ width: `${(item.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs text-slate-500">
                      {item.count}명
                    </span>
                  </li>
                );
              })}

            {(!current || !current.items?.length) && (
              <li className="py-8 text-center text-sm text-slate-400">
                스탯 데이터 없음
              </li>
            )}
          </ul>
        </>
      )}
    </article>
  );
}
