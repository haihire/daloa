"use client";

import { useState } from "react";

const CACHE_KEYS = [
  { key: "sites", label: "?�이??목록 (sites:all)" },
  { key: "characters", label: "캐릭??빌드 (characters:stat-builds)" },
  { key: "youtube", label: "?�튜�?(youtube:popular:first)" },
];

type StatusMap = Record<string, "idle" | "loading" | "done" | "error">;

export default function AdminCachePage() {
  const [status, setStatus] = useState<StatusMap>({});
  const [allLoading, setAllLoading] = useState(false);
  const [allResult, setAllResult] = useState("");

  async function purgeOne(key: string) {
    setStatus((p) => ({ ...p, [key]: "loading" }));
    const res = await fetch("/api/admin/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    setStatus((p) => ({ ...p, [key]: res.ok ? "done" : "error" }));
    setTimeout(() => setStatus((p) => ({ ...p, [key]: "idle" })), 3000);
  }

  async function purgeAll() {
    setAllLoading(true);
    setAllResult("");
    const res = await fetch("/api/admin/cache", { method: "DELETE" });
    if (res.ok) {
      const d = (await res.json()) as { deleted: number };
      setAllResult(`?�료 ??${d.deleted}�?????��`);
    } else {
      setAllResult("?�류 발생");
    }
    setAllLoading(false);
  }

  const statusLabel = (s: string | undefined) => {
    if (s === "loading") return "처리 �?..";
    if (s === "done") return "???�료";
    if (s === "error") return "???�류";
    return "";
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Redis 캐시 무효화</h1>
      <p className="text-sm text-gray-500 mb-8">
        캐시�???��?�면 ?�음 ?�청 ??DB?�서 ?�로 조회?�니??
      </p>

      <div className="space-y-3 mb-8">
        {CACHE_KEYS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-5 py-3"
          >
            <span className="text-sm text-gray-700">{label}</span>
            <div className="flex items-center gap-3">
              {status[key] && status[key] !== "idle" && (
                <span
                  className={`text-xs ${
                    status[key] === "done"
                      ? "text-green-600"
                      : status[key] === "error"
                        ? "text-red-500"
                        : "text-gray-500"
                  }`}
                >
                  {statusLabel(status[key])}
                </span>
              )}
              <button
                onClick={() => purgeOne(key)}
                disabled={status[key] === "loading"}
                className="text-sm border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 px-4 py-1.5 rounded-lg transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center gap-4">
          <button
            onClick={purgeAll}
            disabled={allLoading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors"
          >
            {allLoading ? "처리 중..." : "전체 캐시 삭제"}
          </button>
          {allResult && (
            <span className="text-sm text-gray-500">{allResult}</span>
          )}
        </div>
      </div>
    </div>
  );
}
