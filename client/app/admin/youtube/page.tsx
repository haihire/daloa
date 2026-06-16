"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from "recharts";
import type { YoutubeVideo } from "@/types";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

// ===== 유틸 =====

function parseDurationSec(dur: string): number {
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

function formatRelativeDate(iso: string) {
  const diff = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return `${diff}일 전`;
}

function formatViews(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억회`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만회`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천회`;
  return `${n.toLocaleString()}회`;
}

// ===== 정렬 =====

type ViewSort = "default" | "views_asc" | "views_desc";
type DurSort = "default" | "dur_asc" | "dur_desc";

const VIEW_CYCLE: ViewSort[] = ["default", "views_asc", "views_desc"];
const DUR_CYCLE: DurSort[] = ["default", "dur_asc", "dur_desc"];

const VIEW_LABEL: Record<ViewSort, string> = {
  default: "조회수",
  views_asc: "조회수 ↑",
  views_desc: "조회수 ↓",
};
const DUR_LABEL: Record<DurSort, string> = {
  default: "길이",
  dur_asc: "길이 ↑",
  dur_desc: "길이 ↓",
};

// ===== Bar Chart =====

function BarChart({
  title,
  data,
  color = "bg-blue-500",
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <p className="text-xs font-semibold text-[color:var(--admin-text-muted)] mb-3 uppercase tracking-wide">
        {title}
      </p>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="text-xs text-[color:var(--admin-text-muted)] w-16 shrink-0 text-right leading-none truncate">
              {d.label}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`${color} h-full rounded-full transition-all duration-500`}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-[color:var(--admin-text)] font-medium tabular-nums w-6 text-right">
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Main =====

export default function AdminYoutubePage() {
  const [items, setItems] = useState<YoutubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<"idle" | "done" | "error">(
    "idle",
  );
  const [viewSort, setViewSort] = useState<ViewSort>("default");
  const [durSort, setDurSort] = useState<DurSort>("default");
  const [rangeDay, setRangeDay] = useState(30);
  const [historyData, setHistoryData] = useState<
    { date: string; avg: number }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [accessNotice, setAccessNotice] = useState("");
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const role = useAdminRole();
  const isGuest = role === "guest";

  function requireMaster(action: string) {
    if (!isGuest) return true;
    setAccessNotice(buildGuestNotice(action));
    return false;
  }

  function cycleView() {
    setViewSort(
      (prev) => VIEW_CYCLE[(VIEW_CYCLE.indexOf(prev) + 1) % VIEW_CYCLE.length],
    );
    setDurSort("default");
  }
  function cycleDur() {
    setDurSort(
      (prev) => DUR_CYCLE[(DUR_CYCLE.indexOf(prev) + 1) % DUR_CYCLE.length],
    );
    setViewSort("default");
  }

  async function load() {
    setLoading(true);
    try {
      // 캐시버스터(_=ts) — 엔드포인트가 public s-maxage라 no-store만으론
      // 공유 CDN 캐시를 못 건너뜀. 유니크 URL로 항상 오리진 최신을 받는다.
      const res = await fetch(
        `/api/streamers/popular?offset=0&limit=0&_=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        items: YoutubeVideo[];
      };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function loadBlocked() {
    try {
      const res = await fetch("/api/admin/youtube/blocked", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: string[] };
      setBlockedIds(data.items ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadBlocked();
  }, []);

  async function handleBlock(videoId: string, title: string) {
    if (!requireMaster("영상 삭제")) return;
    if (!window.confirm(`이 영상을 인기 목록에서 삭제할까요?\n\n${title}`)) return;
    setBusyId(videoId);
    try {
      const res = await fetch("/api/admin/youtube/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((v) => v.videoId !== videoId));
        setBlockedIds((prev) =>
          prev.includes(videoId) ? prev : [...prev, videoId],
        );
      } else {
        alert("영상 삭제에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnblock(videoId: string) {
    if (!requireMaster("삭제 되돌리기")) return;
    setBusyId(videoId);
    try {
      const res = await fetch("/api/admin/youtube/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (res.ok) {
        setBlockedIds((prev) => prev.filter((id) => id !== videoId));
        await load(); // 되돌린 영상이 목록에 다시 나타나도록 갱신
      } else {
        alert("되돌리기에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `/api/streamers/view-history?days=${rangeDay}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { date: string; avg: number }[];
        setHistoryData(
          data.map((d) => {
            const dt = new Date(d.date);
            return { date: `${dt.getMonth() + 1}/${dt.getDate()}`, avg: d.avg };
          }),
        );
      } catch {
        setHistoryData([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [rangeDay]);

  async function handlePurge() {
    if (!requireMaster("유튜브 캐시 새로고침")) return;
    setPurging(true);
    setPurgeResult("idle");
    const res = await fetch("/api/admin/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "youtube" }),
    });
    setPurgeResult(res.ok ? "done" : "error");
    setPurging(false);
    if (res.ok) {
      void load(); // 캐시 비운 뒤 최신 목록 다시 불러오기
    }
    setTimeout(() => setPurgeResult("idle"), 3000);
  }

  const filtered = useMemo(() => {
    const arr = [...items];
    if (viewSort === "views_asc")
      return arr.sort((a, b) => a.viewCount - b.viewCount);
    if (viewSort === "views_desc")
      return arr.sort((a, b) => b.viewCount - a.viewCount);
    if (durSort === "dur_asc")
      return arr.sort(
        (a, b) => parseDurationSec(a.duration) - parseDurationSec(b.duration),
      );
    if (durSort === "dur_desc")
      return arr.sort(
        (a, b) => parseDurationSec(b.duration) - parseDurationSec(a.duration),
      );
    return arr;
  }, [items, viewSort, durSort]);

  const stats = useMemo(() => {
    if (items.length === 0) return null;

    const durBuckets = [
      { label: "~10분", count: 0 },
      { label: "10~20분", count: 0 },
      { label: "20~30분", count: 0 },
      { label: "30분+", count: 0 },
    ];
    const channelMap = new Map<string, number>();

    for (const v of items) {
      const sec = parseDurationSec(v.duration);
      if (sec < 600) durBuckets[0].count++;
      else if (sec < 1200) durBuckets[1].count++;
      else if (sec < 1800) durBuckets[2].count++;
      else durBuckets[3].count++;

      channelMap.set(v.channelTitle, (channelMap.get(v.channelTitle) ?? 0) + 1);
    }

    const topChannels = [...channelMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));

    return { durBuckets, topChannels };
  }, [items]);

  const sortButtonClass = (active: boolean) =>
    `admin-btn admin-btn-sm ${active ? "admin-btn-primary" : "admin-btn-secondary"}`;

  return (
    <div
      className="flex flex-col h-full"
      style={{ maxHeight: "calc(100vh - 64px)" }}
    >
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 shrink-0">
        <div>
          <h1 className="admin-page-title">유튜브 인기 영상</h1>
          {accessNotice && (
            <pre className="mt-3 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {accessNotice}
            </pre>
          )}
        </div>
        <div className="flex items-center gap-2">
          {purgeResult === "done" && (
            <span className="text-xs text-emerald-600">✓ 캐시 삭제 완료</span>
          )}
          {purgeResult === "error" && (
            <span className="text-xs text-red-500">✗ 오류</span>
          )}
          <button
            onClick={() => setShowBlocked((v) => !v)}
            className="admin-btn admin-btn-secondary"
          >
            삭제됨 {blockedIds.length}
          </button>
          <button
            onClick={handlePurge}
            disabled={purging}
            className="admin-btn admin-btn-secondary"
          >
            {purging ? "처리 중..." : "캐시 새로고침"}
          </button>
        </div>
      </div>

      {/* 정렬 바 */}
      <div className="admin-card admin-card-padded mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--admin-text-muted)] mr-2 font-medium">
            정렬:
          </span>
          <button
            onClick={cycleView}
            className={sortButtonClass(viewSort !== "default")}
          >
            {VIEW_LABEL[viewSort]}
          </button>
          <button
            onClick={cycleDur}
            className={sortButtonClass(durSort !== "default")}
          >
            {DUR_LABEL[durSort]}
          </button>
          <span className="text-xs text-[color:var(--admin-text-subtle)] ml-auto">
            게시일 기준 정렬 (기본)
          </span>
        </div>
      </div>

      {/* 삭제 관리 패널 */}
      {showBlocked && (
        <div className="admin-card admin-card-padded mb-4 shrink-0">
          <p className="text-xs font-semibold text-[color:var(--admin-text-muted)] mb-2 uppercase tracking-wide">
            삭제한 영상 ({blockedIds.length})
          </p>
          {blockedIds.length === 0 ? (
            <p className="text-xs text-[color:var(--admin-text-subtle)]">
              삭제한 영상이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {blockedIds.map((id) => (
                <li key={id} className="flex items-center gap-2 text-xs">
                  <a
                    href={`https://www.youtube.com/watch?v=${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 truncate flex-1 tabular-nums"
                  >
                    {id}
                  </a>
                  <button
                    onClick={() => void handleUnblock(id)}
                    disabled={busyId === id}
                    className="admin-btn admin-btn-sm admin-btn-secondary shrink-0"
                  >
                    되돌리기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 본문: 목록 + 통계 */}
      <div className="flex flex-1 gap-5 min-h-0">
        {/* 좌측: 영상 목록 */}
        <div className="admin-card flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="admin-loading-box m-4">
                <p className="text-sm text-[color:var(--admin-text-muted)]">
                  유튜브 목록을 불러오는 중입니다...
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-[color:var(--admin-text-muted)] py-12 text-center">
                해당하는 영상이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--admin-border)]">
                {filtered.map((v) => (
                  <li key={v.videoId} className="flex items-center">
                    <a
                      href={`https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 hover:bg-[color:var(--admin-surface-muted)] transition-colors"
                    >
                      <div className="w-28 shrink-0 aspect-video bg-gray-100 rounded-md overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.thumbnailUrl}
                          alt={v.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[color:var(--admin-text)] font-medium leading-snug line-clamp-2 break-keep">
                          {v.title}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="text-blue-600 truncate max-w-[140px]">
                            {v.channelTitle}
                          </span>
                          <span className="text-[color:var(--admin-text-subtle)]">
                            {formatRelativeDate(v.publishedAt)}
                          </span>
                          <span className="text-[color:var(--admin-text-muted)] tabular-nums">
                            {formatViews(v.viewCount)}
                          </span>
                          <span className="text-[color:var(--admin-text-subtle)] tabular-nums">
                            {v.duration}
                          </span>
                        </div>
                      </div>
                    </a>
                    <button
                      onClick={() => void handleBlock(v.videoId, v.title)}
                      disabled={busyId === v.videoId}
                      title="목록에서 삭제"
                      className="admin-btn admin-btn-sm admin-btn-secondary mr-3 shrink-0 text-red-600 disabled:opacity-50"
                    >
                      {busyId === v.videoId ? "..." : "삭제"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 우측: 통계 */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
          {loading ? (
            <div className="admin-loading-box admin-loading-box-compact">
              <p className="text-xs text-[color:var(--admin-text-muted)]">
                통계를 불러오는 중입니다...
              </p>
            </div>
          ) : (
            <>
              {/* 평균 조회수 차트 */}
              <div className="admin-card admin-card-padded">
                <p className="text-xs font-semibold text-[color:var(--admin-text-muted)] mb-3 uppercase tracking-wide">
                  날짜별 평균 조회수
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(
                    [
                      { label: "1일", days: 1 },
                      { label: "3일", days: 3 },
                      { label: "7일", days: 7 },
                      { label: "30일", days: 30 },
                      { label: "90일", days: 90 },
                      { label: "150일", days: 150 },
                      { label: "1년", days: 365 },
                    ] as const
                  ).map(({ label, days }) => (
                    <button
                      key={days}
                      onClick={() => setRangeDay(days)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        rangeDay === days
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-[color:var(--admin-border)] text-[color:var(--admin-text-muted)] hover:border-[color:var(--admin-border-strong)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {historyLoading ? (
                  <p className="text-xs text-[color:var(--admin-text-subtle)] text-center py-6">
                    로딩 중...
                  </p>
                ) : historyData.length === 0 ? (
                  <p className="text-xs text-[color:var(--admin-text-subtle)] text-center py-6">
                    스냅샷 데이터 없음 (갱신 후 시점)
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart
                      data={historyData}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="viewGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#2563eb"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#2563eb"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide />
                      <ReTooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-white border border-[color:var(--admin-border)] shadow-md rounded-md px-2.5 py-1.5 text-xs">
                              <p className="text-[color:var(--admin-text-muted)]">
                                {label}
                              </p>
                              <p className="text-blue-600 font-semibold">
                                {formatViews(payload[0]?.value as number)}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="avg"
                        stroke="#2563eb"
                        strokeWidth={2}
                        fill="url(#viewGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: "#2563eb" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {stats && (
                <>
                  <div className="admin-card admin-card-padded">
                    <BarChart
                      title="길이 분포"
                      data={stats.durBuckets.map((b) => ({
                        label: b.label,
                        value: b.count,
                      }))}
                      color="bg-teal-500"
                    />
                  </div>
                  <div className="admin-card admin-card-padded">
                    <BarChart
                      title="채널별 (상위 6)"
                      data={stats.topChannels.map((c) => ({
                        label:
                          c.label.length > 8
                            ? c.label.slice(0, 7) + "…"
                            : c.label,
                        value: c.value,
                      }))}
                      color="bg-violet-500"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
