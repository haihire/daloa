"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateAxis } from "@/lib/chart-ticks";
import AdminDatePicker from "@/components/admin/AdminDatePicker";

interface PageLoadPoint {
  bucket: string;
  date: string;
  ttfb: number | null;
  dcl: number | null;
  lcp: number | null;
  load: number | null;
  count: number;
}

const PAGE_LOAD_METRICS = [
  { key: "load", label: "전체 로딩", color: "#2563eb" },
  { key: "lcp", label: "LCP", color: "#16a34a" },
  { key: "dcl", label: "DCL", color: "#7c3aed" },
  { key: "ttfb", label: "TTFB", color: "#f59e0b" },
] as const;

// 사용자 로컬 타임존과 무관하게 한국시간(UTC+9) 기준 오늘 날짜(YYYY-MM-DD)
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

type ErrorLog = {
  id: string;
  statusCode: number;
  errorName: string;
  method: string;
  path: string;
  message: string | null;
  stack: string | null;
  createdAt: string;
};

// 에러 발생 시각을 한국시간 "M/D HH:MM:SS"로 표시
function fmtErrTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

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
  };
  siteClickSeries: { minute: string; count: number }[];
  youtubeClickSeries: { minute: string; count: number }[];
  pageVisits: { path: string; device_type: string; count: number }[];
  countryVisits: { countryCode: string; count: number }[];
  osVisits: { osName: string; count: number }[];
  browserVisits: { browserName: string; count: number }[];
  siteClicks: {
    siteName: string;
    siteHref: string;
    siteCategory: string;
    clickCount: number;
  }[];
  pageVisitSeries?: { day: string; count: number }[];
  youtubeClickTotal?: number;
};

const EMPTY_DASHBOARD: Dashboard = {
  summary: {
    windowMinutes: 60,
    avgDurationMs: 0,
    pageVisits: 0,
    deviceCounts: { mobile: 0, desktop: 0, tablet: 0, bot: 0 },
  },
  siteClickSeries: [],
  youtubeClickSeries: [],
  pageVisits: [],
  countryVisits: [],
  osVisits: [],
  browserVisits: [],
  siteClicks: [],
};

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
  // 반올림 결과 0%인 항목은 숨김(0.x% 같은 미미한 값이 0%로 표시되는 노이즈 제거)
  return raw
    .map((r, idx) => ({ ...r.item, pct: pct[idx] }))
    .filter((item) => item.pct > 0);
}

let monitoringCache: Dashboard | null = null;

export default function MonitoringPage() {
  const [data, setData] = useState<Dashboard>(
    monitoringCache ?? EMPTY_DASHBOARD,
  );
  const [loading, setLoading] = useState(monitoringCache === null);
  const [liveVisitDelta, setLiveVisitDelta] = useState(0);
  const [deviceTab, setDeviceTab] = useState<"device" | "browser">("device");
  const [activeChart, setActiveChart] = useState<string | null>(null);
  const [pageVisitDays, setPageVisitDays] = useState<7 | 30>(7);
  const [pageLoadFrom, setPageLoadFrom] = useState<string>(kstToday);
  const [pageLoadTo, setPageLoadTo] = useState<string>(kstToday);
  const [pageLoadMinDate, setPageLoadMinDate] = useState<string>("");
  const [pageLoadSeries, setPageLoadSeries] = useState<PageLoadPoint[]>([]);
  const [pageLoadLoading, setPageLoadLoading] = useState(true);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errStatus, setErrStatus] = useState<"all" | "4xx" | "5xx">("all");
  const [errDays, setErrDays] = useState<1 | 7 | 30>(7);
  const [errLoading, setErrLoading] = useState(true);
  const [expandedErrId, setExpandedErrId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const prevVisitCountRef = useRef(0);

  useEffect(() => {
    let alive = true;
    async function load(initial = false) {
      if (initial && monitoringCache === null) setLoading(true);
      try {
        const dashboardRes = await fetch(
          "/api/admin/monitoring/dashboard",
          { cache: "no-store" },
        );
        if (!alive) return;

        const dashboard = dashboardRes.ok
          ? ((await dashboardRes.json()) as Dashboard)
          : null;

        setData((prev) => {
          const base = dashboard ?? prev;
          if (dashboard) monitoringCache = base;

          const nextVisitCount = base.summary.pageVisits ?? 0;
          const prevVisitCount = prevVisitCountRef.current;
          if (prevVisitCount > 0 && nextVisitCount > prevVisitCount) {
            setLiveVisitDelta(nextVisitCount - prevVisitCount);
            window.setTimeout(() => setLiveVisitDelta(0), 2500);
          }
          prevVisitCountRef.current = nextVisitCount;

          return {
            ...base,
            pageVisitSeries: prev.pageVisitSeries ?? base.pageVisitSeries,
          };
        });
        hasLoadedRef.current = true;
      } catch {
        // Keep previous dashboard snapshot if polling fails.
      } finally {
        if (initial) setLoading(false);
      }
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
    async function loadPageVisitSeries() {
      try {
        const res = await fetch(
          `/api/admin/monitoring/dashboard?pvDays=${pageVisitDays}`,
          { cache: "no-store" },
        );
        if (!alive || !res.ok) return;
        const dashboard = (await res.json()) as Dashboard;
        setData((prev) => ({
          ...prev,
          pageVisitSeries: dashboard.pageVisitSeries ?? prev.pageVisitSeries,
          youtubeClickTotal:
            dashboard.youtubeClickTotal ?? prev.youtubeClickTotal,
        }));
      } catch {
        // Keep existing data if fetch fails.
      }
    }
    void loadPageVisitSeries();
    return () => {
      alive = false;
    };
  }, [pageVisitDays]);

  useEffect(() => {
    let alive = true;
    setPageLoadLoading(true);
    async function loadPageLoad() {
      try {
        const res = await fetch(
          `/api/admin/monitoring/page-load-series?from=${pageLoadFrom}&to=${pageLoadTo}`,
          { cache: "no-store" },
        );
        if (!alive || !res.ok) return;
        const series = (await res.json()) as PageLoadPoint[];
        setPageLoadSeries(Array.isArray(series) ? series : []);
      } catch {
        // keep previous
      } finally {
        if (alive) setPageLoadLoading(false);
      }
    }
    void loadPageLoad();
    return () => {
      alive = false;
    };
  }, [pageLoadFrom, pageLoadTo]);

  // 에러 로그 조회 — 필터(상태/기간) 변경 시 + 15초 주기 갱신
  useEffect(() => {
    let alive = true;
    setErrLoading(true);
    async function loadErrors() {
      try {
        const res = await fetch(
          `/api/admin/monitoring/errors?days=${errDays}&status=${errStatus}&limit=100`,
          { cache: "no-store" },
        );
        if (!alive || !res.ok) return;
        const rows = (await res.json()) as ErrorLog[];
        setErrorLogs(Array.isArray(rows) ? rows : []);
      } catch {
        // keep previous
      } finally {
        if (alive) setErrLoading(false);
      }
    }
    void loadErrors();
    const timer = setInterval(() => void loadErrors(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [errStatus, errDays]);

  // 달력 하한(첫 데이터 날짜) 1회 조회 — 이 이전은 선택 불가
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/monitoring/page-load-earliest", {
          cache: "no-store",
        });
        if (!alive || !res.ok) return;
        const data = (await res.json()) as { earliest: string | null };
        if (data.earliest) setPageLoadMinDate(data.earliest);
      } catch {
        // 하한 없으면 그냥 전체 선택 가능
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pageLoadLatest = useMemo(() => {
    for (let i = pageLoadSeries.length - 1; i >= 0; i -= 1) {
      if ((pageLoadSeries[i].count ?? 0) > 0) return pageLoadSeries[i];
    }
    return null;
  }, [pageLoadSeries]);

  const siteClickTotal = useMemo(
    () => data.siteClicks.reduce((sum, item) => sum + item.clickCount, 0),
    [data.siteClicks],
  );

  const deviceSummary = useMemo(() => {
    const summaryCounts = data.summary.deviceCounts;
    if (summaryCounts) {
      const mobile = summaryCounts.mobile ?? 0;
      const desktop = summaryCounts.desktop ?? 0;
      const tablet = summaryCounts.tablet ?? 0;
      const bot = summaryCounts.bot ?? 0;
      return {
        total: mobile + desktop + tablet + bot,
        mobile,
        desktop,
        tablet,
        bot,
      };
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
    return {
      total: mobile + desktop + tablet + bot,
      mobile,
      desktop,
      tablet,
      bot,
    };
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
    () =>
      toFixedHundred(
        data.siteClicks
          .slice(0, 4)
          .map((item) => ({ ...item, count: item.clickCount })),
      ),
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
      else if (
        name.includes("ios") ||
        name.includes("iphone") ||
        name.includes("ipad")
      )
        counters.iOS += row.count;
      else if (name.includes("mac")) counters.Mac += row.count;
    }
    return toFixedHundred([
      { osName: "Windows", count: counters.Windows },
      { osName: "GNU/Linux", count: counters["GNU/Linux"] },
      { osName: "iOS", count: counters.iOS },
      { osName: "Mac", count: counters.Mac },
    ]);
  }, [data.osVisits]);

  const normalizeLabel = (value: string) =>
    value.toUpperCase() === "UNKNOWN" ? "기타" : value;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="admin-page-title">모니터링</h1>
        </div>
        <div className="flex shrink-0 items-center pt-1 text-xs text-[color:var(--admin-text-muted)]">
          평균 응답
          <span className="ml-1 font-semibold text-[color:var(--admin-text)]">
            {data.summary.avgDurationMs}ms
          </span>
        </div>
      </div>

      {loading && (
        <div className="admin-loading-box admin-loading-box-compact mb-4 shrink-0">
          <p className="text-sm text-[color:var(--admin-text-muted)]">
            모니터링 지표를 불러오는 중입니다...
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)] xl:items-stretch">
        {/* 왼쪽: 그래프 영역 (좌측 컬럼) */}
        <div className="flex min-w-0 flex-col gap-4">
        <div className="admin-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">메인페이지 로딩 속도 추이</p>
              {pageLoadLatest && pageLoadLatest.load != null && (
                <span className="text-xs text-[color:var(--admin-text-muted)]">
                  최근 전체로딩{" "}
                  <span className="font-semibold text-[color:var(--admin-text)]">
                    {(pageLoadLatest.load / 1000).toFixed(1)}초
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs">
              <AdminDatePicker
                value={pageLoadFrom}
                min={pageLoadMinDate}
                max={kstToday()}
                onChange={(v) => {
                  // 시작을 끝보다 뒤로 고르면 끝도 같이 맞춰 순서 유지
                  setPageLoadFrom(v);
                  if (pageLoadTo && v > pageLoadTo) setPageLoadTo(v);
                }}
              />
              <span className="text-[color:var(--admin-text-muted)]">~</span>
              <AdminDatePicker
                value={pageLoadTo}
                min={pageLoadMinDate}
                max={kstToday()}
                onChange={(v) => {
                  // 끝을 시작보다 앞으로 고르면 시작도 같이 맞춰 순서 유지
                  setPageLoadTo(v);
                  if (pageLoadFrom && v < pageLoadFrom) setPageLoadFrom(v);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const t = kstToday();
                  setPageLoadFrom(t);
                  setPageLoadTo(t);
                }}
                className="admin-btn admin-btn-sm admin-btn-secondary"
              >
                오늘
              </button>
              {pageLoadFrom !== pageLoadTo && (
                <span className="ml-1 text-[10px] text-[color:var(--admin-text-muted)]">
                  점 클릭 → 해당일
                </span>
              )}
            </div>
          </div>
          <div className="h-56">
            {pageLoadLoading ? (
              <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                불러오는 중...
              </div>
            ) : pageLoadSeries.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                데이터 없음 (수집 시작 후 표시됩니다)
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={pageLoadSeries}
                  margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
                  onMouseEnter={() => setActiveChart("page-load")}
                  onMouseLeave={() => setActiveChart(null)}
                  onClick={(state) => {
                    // 일별(여러 날) 보기에서 점 클릭 → 그날 하루(시간별)로 드릴다운.
                    // recharts v3는 activePayload가 없어 activeIndex/activeLabel로 행을 찾는다.
                    if (pageLoadFrom === pageLoadTo) return;
                    const idx = state.activeIndex ?? state.activeTooltipIndex;
                    const row =
                      (idx != null ? pageLoadSeries[Number(idx)] : undefined) ??
                      pageLoadSeries.find(
                        (p) => p.bucket === String(state.activeLabel),
                      );
                    if (row?.date) {
                      setPageLoadFrom(row.date);
                      setPageLoadTo(row.date);
                    }
                  }}
                  className={pageLoadFrom !== pageLoadTo ? "cursor-pointer" : ""}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 9, fill: "#6b7280" }}
                    {...dateAxis(pageLoadSeries, "bucket")}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} unit="ms" />
                  <Tooltip
                    active={activeChart === "page-load"}
                    formatter={(v, name) => [v == null ? "-" : `${v}ms`, name]}
                    wrapperStyle={{ pointerEvents: "none" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {PAGE_LOAD_METRICS.map((m) => (
                    <Line
                      key={m.key}
                      type="monotone"
                      dataKey={m.key}
                      name={m.label}
                      stroke={m.color}
                      dot={{ r: 2 }}
                      strokeWidth={2}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid auto-rows-min content-start grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">사이트 클릭 타임라인 (일)</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">
                누적 {siteClickTotal.toLocaleString()}회
              </span>
            </div>
            <div className="h-52">
              {loading ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                  불러오는 중...
                </div>
              ) : data.siteClickSeries.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={220}
                  minHeight={120}
                >
                  <AreaChart
                    data={data.siteClickSeries}
                    margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
                    onMouseEnter={() => setActiveChart("site-click")}
                    onMouseLeave={() => setActiveChart(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="minute"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      {...dateAxis(data.siteClickSeries, "minute")}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip
                      active={activeChart === "site-click"}
                      wrapperStyle={{ pointerEvents: "none" }}
                    />
                    <Area
                      type="linear"
                      dataKey="count"
                      stroke="#2563eb"
                      fill="#bfdbfe"
                      name="사이트 클릭"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">스트림 클릭 타임라인 (일)</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">
                누적 {(data.youtubeClickTotal ?? 0).toLocaleString()}회
              </span>
            </div>
            <div className="h-52">
              {loading ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                  불러오는 중...
                </div>
              ) : data.youtubeClickSeries.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={220}
                  minHeight={120}
                >
                  <AreaChart
                    data={data.youtubeClickSeries}
                    margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
                    onMouseEnter={() => setActiveChart("youtube-click")}
                    onMouseLeave={() => setActiveChart(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="minute"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      {...dateAxis(data.youtubeClickSeries, "minute")}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip
                      active={activeChart === "youtube-click"}
                      wrapperStyle={{ pointerEvents: "none" }}
                    />
                    <Area
                      type="linear"
                      dataKey="count"
                      stroke="#ef4444"
                      fill="#fecaca"
                      name="스트림 클릭"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">페이지 방문 추이 (일)</p>
                <span className="text-xs text-[color:var(--admin-text-muted)]">
                  누적 {data.summary.pageVisits.toLocaleString()}회
                </span>
              </div>
              <div className="flex gap-1">
                {([7, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPageVisitDays(d)}
                    className={`admin-btn admin-btn-sm ${pageVisitDays === d ? "admin-btn-primary" : "admin-btn-secondary"}`}
                  >
                    {d}일
                  </button>
                ))}
              </div>
            </div>
            <div className="h-32">
              {loading ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                  불러오는 중...
                </div>
              ) : (data.pageVisitSeries ?? []).length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={220}
                  minHeight={120}
                >
                  <AreaChart
                    data={data.pageVisitSeries}
                    margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
                    onMouseEnter={() => setActiveChart("page-visit")}
                    onMouseLeave={() => setActiveChart(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      {...dateAxis(data.pageVisitSeries ?? [], "day")}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip
                      active={activeChart === "page-visit"}
                      wrapperStyle={{ pointerEvents: "none" }}
                    />
                    <Area
                      type="linear"
                      dataKey="count"
                      stroke="#7c3aed"
                      fill="#ede9fe"
                      name="페이지 방문"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        </div>
        {/* 오른쪽: 통계 목록 (우측 세로 컬럼)
            xl에서는 relative 래퍼(높이는 grid stretch로 왼쪽 그래프 높이에 맞춰짐) 안에
            내부 그리드를 absolute inset-0으로 띄워, 오른쪽 콘텐츠가 행 높이를 늘리지 못하게 한다.
            → 행 높이는 왼쪽 그래프 높이로만 결정되고, 넘치는 항목은 각 카드 내부 스크롤로 처리. */}
        <div className="xl:relative xl:min-w-0">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:absolute xl:inset-0 xl:grid-cols-1 xl:grid-rows-4 xl:[&>div]:min-h-0 xl:[&>div]:overflow-y-auto">
          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">사이트 클릭 상위</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">
                누적
              </span>
            </div>
            <div className="space-y-1">
              {siteClickShareItems.length === 0 ? (
                <div className="text-sm text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : (
                siteClickShareItems.map((item) => (
                  <div
                    key={`${item.siteName}-${item.siteHref}-${item.siteCategory}`}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5"
                  >
                    <p className="truncate text-sm font-medium">
                      {item.siteName}
                    </p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setDeviceTab("device")}
                  className={`rounded px-2 py-1 text-xs ${deviceTab === "device" ? "bg-white font-semibold text-[color:var(--admin-text)]" : "text-[color:var(--admin-text-muted)]"}`}
                >
                  Devices
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceTab("browser")}
                  className={`rounded px-2 py-1 text-xs ${deviceTab === "browser" ? "bg-white font-semibold text-[color:var(--admin-text)]" : "text-[color:var(--admin-text-muted)]"}`}
                >
                  Browsers
                </button>
              </div>
              {liveVisitDelta > 0 ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  +{liveVisitDelta}
                </span>
              ) : null}
            </div>
            <div className="space-y-1">
              {(deviceTab === "device" ? deviceItems : browserItems).length ===
              0 ? (
                <div className="grid h-24 place-items-center text-xs text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : deviceTab === "device" ? (
                deviceItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5"
                  >
                    <p className="text-sm font-medium">
                      {normalizeLabel(item.label)}
                    </p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              ) : (
                browserItems.map((item) => (
                  <div
                    key={item.browserName}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5"
                  >
                    <p className="text-sm font-medium">
                      {normalizeLabel(item.browserName)}
                    </p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">국가 분포</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">
                방문
              </span>
            </div>
            <div className="space-y-1">
              {countryShareItems.length === 0 ? (
                <div className="text-sm text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : (
                countryShareItems.map((item) => (
                  <div
                    key={item.countryCode}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5"
                  >
                    <p className="text-sm font-medium">
                      {normalizeLabel(item.countryCode)}
                    </p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">운영체제 분포</p>
              <span className="text-xs text-[color:var(--admin-text-muted)]">
                방문
              </span>
            </div>
            <div className="space-y-1">
              {osShareItems.length === 0 ? (
                <div className="text-sm text-[color:var(--admin-text-muted)]">
                  데이터 없음
                </div>
              ) : (
                osShareItems.map((item) => (
                  <div
                    key={item.osName}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5"
                  >
                    <p className="text-sm font-medium">
                      {normalizeLabel(item.osName)}
                    </p>
                    <p className="text-sm font-semibold">{item.pct}%</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* 에러 로그 (401/404 제외 전부 기록) */}
      <div className="admin-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">에러 로그</p>
            <span className="text-xs text-[color:var(--admin-text-muted)]">
              최근 {errDays}일 · {errorLogs.length}건
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
              {(["all", "5xx", "4xx"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setErrStatus(s)}
                  className={`rounded px-2 py-1 text-xs ${errStatus === s ? "bg-white font-semibold text-[color:var(--admin-text)]" : "text-[color:var(--admin-text-muted)]"}`}
                >
                  {s === "all" ? "전체" : s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
              {([1, 7, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setErrDays(d)}
                  className={`rounded px-2 py-1 text-xs ${errDays === d ? "bg-white font-semibold text-[color:var(--admin-text)]" : "text-[color:var(--admin-text-muted)]"}`}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>
        </div>

        {errLoading && errorLogs.length === 0 ? (
          <div className="grid h-24 place-items-center text-sm text-[color:var(--admin-text-muted)]">
            불러오는 중...
          </div>
        ) : errorLogs.length === 0 ? (
          <div className="grid h-24 place-items-center text-sm text-[color:var(--admin-text-muted)]">
            에러 없음 🎉
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[color:var(--admin-card-bg,#fff)] text-[color:var(--admin-text-muted)]">
                <tr className="border-b border-[color:var(--admin-border)]">
                  <th className="whitespace-nowrap py-1.5 pr-2 font-medium">
                    시각
                  </th>
                  <th className="py-1.5 pr-2 font-medium">상태</th>
                  <th className="py-1.5 pr-2 font-medium">메서드</th>
                  <th className="py-1.5 pr-2 font-medium">경로</th>
                  <th className="py-1.5 pr-2 font-medium">에러</th>
                  <th className="py-1.5 font-medium">메시지</th>
                </tr>
              </thead>
              <tbody>
                {errorLogs.map((e) => {
                  const is5xx = e.statusCode >= 500;
                  const canExpand = !!e.stack;
                  const expanded = expandedErrId === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className={`border-b border-slate-100 ${canExpand ? "cursor-pointer hover:bg-slate-50" : ""}`}
                        onClick={() =>
                          canExpand &&
                          setExpandedErrId(expanded ? null : e.id)
                        }
                      >
                        <td className="whitespace-nowrap py-1.5 pr-2 text-[color:var(--admin-text-muted)]">
                          {fmtErrTime(e.createdAt)}
                        </td>
                        <td className="py-1.5 pr-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${is5xx ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                          >
                            {e.statusCode}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 font-mono">{e.method}</td>
                        <td
                          className="max-w-[220px] truncate py-1.5 pr-2 font-mono"
                          title={e.path}
                        >
                          {e.path}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-2">
                          {e.errorName}
                        </td>
                        <td
                          className="max-w-[280px] truncate py-1.5"
                          title={e.message ?? ""}
                        >
                          {e.message}
                          {canExpand ? (
                            <span className="ml-1 text-[color:var(--admin-text-muted)]">
                              {expanded ? "▲" : "▼"}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {expanded && e.stack ? (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 px-3 py-2">
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[color:var(--admin-text)]">
                              {e.stack}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
