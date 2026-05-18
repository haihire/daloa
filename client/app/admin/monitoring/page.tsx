"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Dashboard = {
  summary: {
    windowMinutes: number;
    avgDurationMs: number;
    pageVisits: number;
    deviceCounts?: {
      mobile: number;
      desktop: number;
      tablet: number;
      bot: number;
    };
    latestSystem: null | {
      created_at: string;
      cpu_percent: number;
      memory_percent: number;
      rss_mb: number;
      heap_used_mb: number;
      heap_total_mb?: number;
      total_mem_mb: number;
    };
  };
  siteClickSeries: { minute: string; count: number }[];
  youtubeClickSeries: { minute: string; count: number }[];
  sectionSeries: { minute: string; label: string; avgDurationMs: number; count: number }[];
  pageVisits: { path: string; device_type: string; count: number }[];
  countryVisits: { countryCode: string; count: number }[];
  osVisits: { osName: string; count: number }[];
  browserVisits: { browserName: string; count: number }[];
  siteClicks: { siteName: string; siteHref: string; siteCategory: string; clickCount: number }[];
  systemSeries: {
    at: string;
    cpuPercent: number;
    memoryPercent: number;
    rssMb: number;
    heapUsedMb: number;
    totalMemMb: number;
  }[];
};

const EMPTY_DASHBOARD: Dashboard = {
  summary: {
    windowMinutes: 60,
    avgDurationMs: 0,
    pageVisits: 0,
    deviceCounts: { mobile: 0, desktop: 0, tablet: 0, bot: 0 },
    latestSystem: null,
  },
  siteClickSeries: [],
  youtubeClickSeries: [],
  sectionSeries: [],
  pageVisits: [],
  countryVisits: [],
  osVisits: [],
  browserVisits: [],
  siteClicks: [],
  systemSeries: [],
};

const RANGE_OPTIONS = [1, 3, 7, 30] as const;

function toFixedHundred<T extends { count: number }>(
  items: T[],
): Array<T & { pct: number }> {
  const filtered = items.filter((item) => item.count > 0);
  const total = filtered.reduce((sum, item) => sum + item.count, 0);
  if (total <= 0) return [];

  const raw = filtered.map((item) => ({
    item,
    exact: (item.count / total) * 100,
  }));
  const floored = raw.map((r) => Math.floor(r.exact));
  let remainder = 100 - floored.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((r, idx) => ({ idx, frac: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.frac - a.frac);
  const pct = [...floored];
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    pct[order[cursor % order.length].idx] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return raw.map((r, idx) => ({ ...r.item, pct: pct[idx] }));
}

export default function MonitoringPage() {
  const [data, setData] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [liveVisitDelta, setLiveVisitDelta] = useState(0);
  const [deviceTab, setDeviceTab] = useState<"device" | "browser">("device");
  const [activeChart, setActiveChart] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const prevVisitCountRef = useRef(0);
  const LIVE_WINDOW_MS = 60 * 60 * 1000;

  useEffect(() => {
    let alive = true;
    async function load(initial = false) {
      if (initial) setLoading(true);
      const [dashboardRes, currentRes] = await Promise.all([
        fetch("/api/admin/monitoring/dashboard?days=7", { cache: "no-store" }),
        fetch("/api/admin/monitoring/system/current", { cache: "no-store" }),
      ]);
      if (!alive) return;

      const dashboard = dashboardRes.ok ? ((await dashboardRes.json()) as Dashboard) : null;
      const current = currentRes.ok ? ((await currentRes.json()) as Dashboard["summary"]["latestSystem"]) : null;

      setData((prev) => {
        const base = dashboard ?? prev;
        const livePoint = current
          ? {
              at: current.created_at,
              cpuPercent: current.cpu_percent,
              memoryPercent: current.memory_percent,
              rssMb: current.rss_mb,
              heapUsedMb: current.heap_used_mb,
              totalMemMb: current.total_mem_mb,
            }
          : null;
        const now = Date.now();
        const mergedSystemSeries = [...(base.systemSeries ?? []), ...(livePoint ? [livePoint] : [])]
          .filter((item) => {
            const at = new Date(item.at).getTime();
            return Number.isFinite(at) && now - at <= LIVE_WINDOW_MS;
          })
          .reduce<Dashboard["systemSeries"]>((acc, item) => {
            if (acc.length === 0 || acc[acc.length - 1].at !== item.at) acc.push(item);
            return acc;
          }, []);

        const nextVisitCount = base.summary.pageVisits ?? 0;
        const prevVisitCount = prevVisitCountRef.current;
        if (prevVisitCount > 0 && nextVisitCount > prevVisitCount) {
          setLiveVisitDelta(nextVisitCount - prevVisitCount);
          window.setTimeout(() => setLiveVisitDelta(0), 2500);
        }
        prevVisitCountRef.current = nextVisitCount;

        return {
          ...base,
          sectionSeries: prev.sectionSeries,
          systemSeries: mergedSystemSeries.length > 0 ? mergedSystemSeries : prev.systemSeries,
          summary: { ...base.summary, latestSystem: current ?? base.summary.latestSystem ?? prev.summary.latestSystem },
        };
      });
      hasLoadedRef.current = true;
      if (initial) setLoading(false);
    }

    void load(true);
    const timer = setInterval(() => void load(!hasLoadedRef.current), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadSectionOnly() {
      const res = await fetch(`/api/admin/monitoring/dashboard?days=${rangeDays}`, { cache: "no-store" });
      if (!alive || !res.ok) return;
      const dashboard = (await res.json()) as Dashboard;
      setData((prev) => ({ ...prev, sectionSeries: dashboard.sectionSeries ?? prev.sectionSeries }));
    }
    void loadSectionOnly();
    return () => {
      alive = false;
    };
  }, [rangeDays]);

  const systemChart = useMemo(
    () =>
      data.systemSeries.map((item) => ({
        ...item,
        minute: item.at ? item.at.slice(11, 16) : "--:--",
        cpuPercent: Number.isFinite(item.cpuPercent) ? item.cpuPercent : 0,
        memoryPercent: Number.isFinite(item.memoryPercent) ? item.memoryPercent : 0,
      })),
    [data.systemSeries],
  );
  const latestSystemPoint = useMemo(() => (systemChart.length > 0 ? systemChart[systemChart.length - 1] : null), [systemChart]);
  const latestSummarySystem = data.summary.latestSystem;

  const siteClickTotal = useMemo(() => data.siteClicks.reduce((sum, item) => sum + item.clickCount, 0), [data.siteClicks]);

  const deviceSummary = useMemo(() => {
    const summaryCounts = data.summary.deviceCounts;
    if (summaryCounts) {
      const mobile = summaryCounts.mobile ?? 0;
      const desktop = summaryCounts.desktop ?? 0;
      const tablet = summaryCounts.tablet ?? 0;
      const bot = summaryCounts.bot ?? 0;
      return { total: mobile + desktop + tablet + bot, mobile, desktop, tablet, bot };
    }

    let mobile = 0;
    let desktop = 0;
    let tablet = 0;
    let bot = 0;
    for (const row of data.pageVisits) {
      if (row.device_type === "mobile") mobile += row.count;
      else if (row.device_type === "desktop") desktop += row.count;
      else if (row.device_type === "tablet") tablet += row.count;
      else if (row.device_type === "bot") bot += row.count;
    }
    return { total: mobile + desktop + tablet + bot, mobile, desktop, tablet, bot };
  }, [data.pageVisits, data.summary.deviceCounts]);

  const deviceItems = useMemo(() => {
    const desktop = deviceSummary.desktop;
    const mobile = deviceSummary.mobile + deviceSummary.tablet;
    return toFixedHundred([
      { label: "Desktop", count: desktop },
      { label: "Mobile", count: mobile },
    ]);
  }, [deviceSummary]);

  const browserItems = useMemo(
    () => toFixedHundred(data.browserVisits.slice(0, 4)),
    [data.browserVisits],
  );

  const siteClickShareItems = useMemo(
    () => toFixedHundred(data.siteClicks.slice(0, 4).map((item) => ({ ...item, count: item.clickCount }))),
    [data.siteClicks],
  );

  const countryShareItems = useMemo(
    () => toFixedHundred(data.countryVisits.slice(0, 6)),
    [data.countryVisits],
  );

  const osShareItems = useMemo(() => {
    const counters = { Windows: 0, "GNU/Linux": 0, iOS: 0, Mac: 0 };
    for (const row of data.osVisits) {
      const name = row.osName.toLowerCase();
      if (name.includes("windows")) counters.Windows += row.count;
      else if (name.includes("linux")) counters["GNU/Linux"] += row.count;
      else if (name.includes("ios") || name.includes("iphone") || name.includes("ipad")) counters.iOS += row.count;
      else if (name.includes("mac")) counters.Mac += row.count;
    }
    return toFixedHundred([
      { osName: "Windows", count: counters.Windows },
      { osName: "GNU/Linux", count: counters["GNU/Linux"] },
      { osName: "iOS", count: counters.iOS },
      { osName: "Mac", count: counters.Mac },
    ]);
  }, [data.osVisits]);

  const normalizeLabel = (value: string) => (value.toUpperCase() === "UNKNOWN" ? "기타" : value);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 shrink-0">
        <h1 className="admin-page-title">모니터링</h1>
        <p className="admin-page-subtitle mt-1">운영 상태와 추세를 빠르게 확인합니다.</p>
      </div>

      <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="admin-stat-card">
          <p className="admin-stat-label">평균 응답</p>
          <p className="admin-stat-value mt-1">{data.summary.avgDurationMs}ms</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">페이지 방문(24h)</p>
          <p className="admin-stat-value mt-1">{data.summary.pageVisits.toLocaleString()}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">사이트 클릭(누적)</p>
          <p className="admin-stat-value mt-1">{siteClickTotal.toLocaleString()}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">실시간 서버 상태</p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--admin-text)]">
            CPU {latestSystemPoint?.cpuPercent ?? 0}% · RAM {latestSystemPoint?.memoryPercent ?? 0}%
          </p>
          <p className="text-xs text-[color:var(--admin-text-muted)]">
            RSS {latestSummarySystem?.rss_mb ?? 0}MB · Heap {latestSummarySystem?.heap_used_mb ?? 0}MB
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="grid auto-rows-min content-start grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="admin-card p-3">
            <p className="mb-2 text-sm font-semibold">사이트 클릭 타임라인 (일)</p>
            <div className="h-40">
              {loading ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">불러오는 중...</div>
              ) : data.siteClickSeries.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">데이터 없음</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={220} minHeight={120}>
                  <AreaChart
                    data={data.siteClickSeries}
                    onMouseEnter={() => setActiveChart("site-click")}
                    onMouseLeave={() => setActiveChart(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="minute" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip active={activeChart === "site-click"} wrapperStyle={{ pointerEvents: "none" }} />
                    <Area type="linear" dataKey="count" stroke="#2563eb" fill="#bfdbfe" name="사이트 클릭" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <p className="mb-2 text-sm font-semibold">유튜브 클릭 타임라인 (일)</p>
            <div className="h-40">
              {loading ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">불러오는 중...</div>
              ) : data.youtubeClickSeries.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">데이터 없음</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={220} minHeight={120}>
                  <AreaChart
                    data={data.youtubeClickSeries}
                    onMouseEnter={() => setActiveChart("youtube-click")}
                    onMouseLeave={() => setActiveChart(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="minute" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip active={activeChart === "youtube-click"} wrapperStyle={{ pointerEvents: "none" }} />
                    <Area type="linear" dataKey="count" stroke="#ef4444" fill="#fecaca" name="유튜브 클릭" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="admin-card p-3 xl:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">기능별 응답 추이 (10분 자동점검)</p>
              <div className="flex gap-1">
                {RANGE_OPTIONS.map((d) => (
                  <button key={d} type="button" onClick={() => setRangeDays(d)} className={`admin-btn admin-btn-sm ${rangeDays === d ? "admin-btn-primary" : "admin-btn-secondary"}`}>
                    {d}일
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {["sites", "stat-builds", "youtube"].map((name) => {
                const series = data.sectionSeries.filter((item) => item.label === name);
                const latest = series.length > 0 ? series[series.length - 1] : null;
                const totalCount = series.reduce((sum, item) => sum + item.count, 0);
                return (
                  <div key={name} className="rounded border border-[color:var(--admin-border)] p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{name}</p>
                      <span className="text-[11px] text-[color:var(--admin-text-muted)]">{latest ? `${latest.avgDurationMs}ms · ${totalCount}회` : "데이터 없음"}</span>
                    </div>
                    <div className="h-20">
                      {series.length === 0 ? (
                        <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">데이터 없음</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={120} minHeight={60}>
                          <AreaChart
                            data={series}
                            onMouseEnter={() => setActiveChart(`section-${name}`)}
                            onMouseLeave={() => setActiveChart(null)}
                          >
                            <XAxis dataKey="minute" hide />
                            <YAxis hide />
                            <Tooltip active={activeChart === `section-${name}`} wrapperStyle={{ pointerEvents: "none" }} />
                            <Area type="linear" dataKey="avgDurationMs" stroke="#2563eb" fill="#dbeafe" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid auto-rows-min content-start gap-4 xl:grid-cols-4">
          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">사이트 클릭 상위</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">누적</span>
            </div>
            <div className="space-y-1">
              {siteClickShareItems.length === 0 ? (
                <div className="text-sm text-[color:var(--admin-text-muted)]">데이터 없음</div>
              ) : (
                siteClickShareItems.map((item) => (
                  <div key={`${item.siteHref}-${item.siteCategory}`} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <p className="truncate text-sm font-medium">{item.siteName}</p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
                <button type="button" onClick={() => setDeviceTab("device")} className={`rounded px-2 py-1 text-xs ${deviceTab === "device" ? "bg-white font-semibold text-[color:var(--admin-text)]" : "text-[color:var(--admin-text-muted)]"}`}>
                  Devices
                </button>
                <button type="button" onClick={() => setDeviceTab("browser")} className={`rounded px-2 py-1 text-xs ${deviceTab === "browser" ? "bg-white font-semibold text-[color:var(--admin-text)]" : "text-[color:var(--admin-text-muted)]"}`}>
                  Browsers
                </button>
              </div>
              {liveVisitDelta > 0 ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">+{liveVisitDelta}</span>
              ) : null}
            </div>
            <div className="space-y-1">
              {(deviceTab === "device" ? deviceItems : browserItems).length === 0 ? (
                <div className="grid h-24 place-items-center text-xs text-[color:var(--admin-text-muted)]">데이터 없음</div>
              ) : deviceTab === "device" ? (
                deviceItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <p className="text-sm font-medium">{normalizeLabel(item.label)}</p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              ) : (
                browserItems.map((item) => (
                  <div key={item.browserName} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <p className="text-sm font-medium">{normalizeLabel(item.browserName)}</p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">국가 분포</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">방문</span>
            </div>
            <div className="space-y-1">
              {countryShareItems.length === 0 ? (
                <div className="text-sm text-[color:var(--admin-text-muted)]">데이터 없음</div>
              ) : (
                countryShareItems.map((item) => (
                  <div key={item.countryCode} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <p className="text-sm font-medium">{normalizeLabel(item.countryCode)}</p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">운영체제 분포</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">방문</span>
            </div>
            <div className="space-y-1">
              {osShareItems.length === 0 ? (
                <div className="text-sm text-[color:var(--admin-text-muted)]">데이터 없음</div>
              ) : (
                osShareItems.map((item) => (
                  <div key={item.osName} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <p className="text-sm font-medium">{normalizeLabel(item.osName)}</p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
