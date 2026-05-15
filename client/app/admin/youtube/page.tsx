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

// ?�?�?� ?�틸 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

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
  if (diff === 0) return "?�늘";
  if (diff === 1) return "?�제";
  return `${diff}????;
}

function formatViews(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}?�회`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만회`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천회`;
  return `${n.toLocaleString()}??;
}

// ?�?�?� ?�렬 ?�수 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

type ViewSort = "default" | "views_asc" | "views_desc";
type DurSort = "default" | "dur_asc" | "dur_desc";

const VIEW_CYCLE: ViewSort[] = ["default", "views_asc", "views_desc"];
const DUR_CYCLE: DurSort[] = ["default", "dur_asc", "dur_desc"];

const VIEW_LABEL: Record<ViewSort, string> = {
  default: "조회??,
  views_asc: "조회????,
  views_desc: "조회????,
};
const DUR_LABEL: Record<DurSort, string> = {
  default: "길이",
  dur_asc: "길이 ??,
  dur_desc: "길이 ??,
};

// ?�?�?� 그래??컴포?�트 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

function BarChart({
  title,
  data,
  color = "bg-indigo-500",
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2">{title}</p>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 shrink-0 text-right leading-none">
              {d.label}
            </span>
            <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className={`${color} h-full rounded-full transition-all duration-500`}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 tabular-nums w-6 text-right">
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ?�?�?� 메인 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export default function AdminYoutubePage() {
  const [items, setItems] = useState<YoutubeVideo[]>([]);
  const [total, setTotal] = useState<number | null>(null);
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
      const res = await fetch("/api/streamers/popular?offset=0&limit=0", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        items: YoutubeVideo[];
        total: number;
      };
      setItems(data.items ?? []);
      setTotal(data.total ?? data.items?.length ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
    setPurging(true);
    setPurgeResult("idle");
    const res = await fetch("/api/admin/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "youtube" }),
    });
    setPurgeResult(res.ok ? "done" : "error");
    setPurging(false);
    setTimeout(() => setPurgeResult("idle"), 3000);
  }

  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<
    "idle" | "done" | "empty" | "error"
  >("idle");

  async function handleSnapshot() {
    setSnapshotting(true);
    setSnapshotResult("idle");
    try {
      const res = await fetch("/api/admin/cache/snapshot-youtube", {
        method: "POST",
      });
      if (!res.ok) {
        setSnapshotResult("error");
        return;
      }
      const data = (await res.json()) as { saved: number; cached: boolean };
      setSnapshotResult(data.cached && data.saved > 0 ? "done" : "empty");
    } catch {
      setSnapshotResult("error");
    } finally {
      setSnapshotting(false);
      setTimeout(() => setSnapshotResult("idle"), 3000);
    }
  }

  // ?�렬??목록
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

  // ?�체 ?�계 (?�터 무�?)
  const stats = useMemo(() => {
    if (items.length === 0) return null;

    // 길이 구간 분포
    const durBuckets = [
      { label: "~10�?, count: 0 },
      { label: "10~20�?, count: 0 },
      { label: "20~30�?, count: 0 },
      { label: "30�?", count: 0 },
    ];
    // 채널�?집계
    const channelMap = new Map<string, number>();

    for (const v of items) {
      // 길이 버킷
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

  return (
    <div
      className="flex flex-col h-full"
      style={{ maxHeight: "calc(100vh - 64px)" }}
    >
      {/* ?�?� ?�더 ?�?� */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">?�튜�??�기 ?�상</h1>
          {total !== null && (
            <span className="text-xs text-gray-500">�?{total}�?/span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {purgeResult === "done" && (
            <span className="text-xs text-green-600">??캐시 ??�� ?�료</span>
          )}
          {purgeResult === "error" && (
            <span className="text-xs text-red-500">???�류</span>
          )}
          {snapshotResult === "done" && (
            <span className="text-xs text-green-600">???�냅???�???�료</span>
          )}
          {snapshotResult === "empty" && (
            <span className="text-xs text-yellow-600">??캐시 ?�음</span>
          )}
          {snapshotResult === "error" && (
            <span className="text-xs text-red-500">???�냅???�류</span>
          )}
          <button
            onClick={handleSnapshot}
            disabled={snapshotting}
            className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
            title="?�재 Redis 캐시???�기 ?�상 조회?��? DB??즉시 ?�냅???�??(UPSERT)"
          >
            {snapshotting ? "?�??�?.." : "?�냅???�??}
          </button>
          <button
            onClick={handlePurge}
            disabled={purging}
            className="text-sm border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            {purging ? "처리 �?.." : "?�로고침"}
          </button>
        </div>
      </div>

      {/* ?�?� ?�렬 �??�?� */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <span className="text-xs text-gray-500 mr-1">게시?�순</span>
        <span className="text-xs text-gray-300">|</span>
        <button
          onClick={cycleView}
          className={`text-xs px-2.5 py-1 rounded border transition-colors ${
            viewSort !== "default"
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
          }`}
        >
          {VIEW_LABEL[viewSort]}
        </button>
        <button
          onClick={cycleDur}
          className={`text-xs px-2.5 py-1 rounded border transition-colors ${
            durSort !== "default"
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
          }`}
        >
          {DUR_LABEL[durSort]}
        </button>
      </div>

      {/* ?�?� 본문: 목록 + ?�계 ?�?� */}
      <div className="flex flex-1 gap-5 min-h-0">
        {/* ?�쪽: ?�상 목록 */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex-1 overflow-y-auto pr-0.5">
            {loading ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                불러?�는 �?..
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                ?�당?�는 ?�상???�습?�다.
              </div>
            ) : (
              filtered.map((v, i) => (
                <a
                  key={v.videoId}
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors rounded-lg ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
                >
                  <div className="w-24 shrink-0 aspect-video bg-gray-200 rounded overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-snug line-clamp-2 break-keep">
                      {v.title}
                    </p>
                    <div className="flex items-center mt-1">
                      <span className="text-xs text-blue-600 w-28 shrink-0 truncate">
                        {v.channelTitle}
                      </span>
                      <span className="text-xs text-gray-400 w-14 shrink-0 tabular-nums">
                        {formatRelativeDate(v.publishedAt)}
                      </span>
                      <span className="text-xs text-gray-500 w-16 shrink-0 tabular-nums">
                        {formatViews(v.viewCount)}
                      </span>
                      <span className="text-xs text-gray-400 w-10 shrink-0 tabular-nums">
                        {v.duration}
                      </span>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* ?�른�? ?�계 그래??*/}
        <div className="w-72 shrink-0 flex flex-col gap-5 overflow-y-auto">
          {loading ? (
            <div className="text-xs text-gray-400 text-center pt-8">
              로딩 �?..
            </div>
          ) : (
            <>
              {/* ?�짜�??�균 조회??차트 */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  ?�짜�??�균 조회??
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(
                    [
                      { label: "1??, days: 1 },
                      { label: "3??, days: 3 },
                      { label: "7??, days: 7 },
                      { label: "30??, days: 30 },
                      { label: "90??, days: 90 },
                      { label: "150??, days: 150 },
                      { label: "1??, days: 365 },
                    ] as const
                  ).map(({ label, days }) => (
                    <button
                      key={days}
                      onClick={() => setRangeDay(days)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        rangeDay === days
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {historyLoading ? (
                  <p className="text-xs text-gray-400 text-center py-6">
                    로딩 �?..
                  </p>
                ) : historyData.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">
                    ?�냅???�이???�음 (갱신 ???�임)
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={150}>
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
                            stopColor="#6366f1"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#6366f1"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#6b7280", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide />
                      <ReTooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-white border border-gray-200 shadow rounded-lg px-2 py-1 text-xs">
                              <p className="text-gray-500">{label}</p>
                              <p className="text-blue-600">
                                {formatViews(payload[0]?.value as number)}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="avg"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="url(#viewGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: "#6366f1" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {stats && (
                <>
                  <BarChart
                    title="길이 분포"
                    data={stats.durBuckets.map((b) => ({
                      label: b.label,
                      value: b.count,
                    }))}
                    color="bg-teal-500"
                  />
                  <BarChart
                    title="채널�?(?�위 6)"
                    data={stats.topChannels.map((c) => ({
                      label:
                        c.label.length > 8
                          ? c.label.slice(0, 7) + "??
                          : c.label,
                      value: c.value,
                    }))}
                    color="bg-violet-500"
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
