"use client";

import { useState } from "react";
import { AdminLoadingState } from "@/app/admin/_components/AdminLoadingState";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

const CACHE_KEYS = [
  { key: "sites", label: "사이트 목록", desc: "sites:all" },
  { key: "characters", label: "캐릭터 빌드", desc: "characters:stat-builds" },
  { key: "youtube", label: "유튜브", desc: "youtube:popular:first" },
];

type StatusMap = Record<string, "idle" | "loading" | "done" | "error">;

export default function AdminCachePage() {
  const [status, setStatus] = useState<StatusMap>({});
  const [allLoading, setAllLoading] = useState(false);
  const [allResult, setAllResult] = useState("");
  const [accessNotice, setAccessNotice] = useState("");
  const role = useAdminRole();
  const isGuest = role === "guest";
  const isWorking = allLoading || Object.values(status).includes("loading");

  function requireMaster(action: string) {
    if (!isGuest) return true;
    setAccessNotice(buildGuestNotice(action));
    return false;
  }

  async function purgeOne(key: string) {
    if (!requireMaster("캐시 개별 새로고침")) return;
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
    if (!requireMaster("전체 캐시 새로고침")) return;
    setAllLoading(true);
    setAllResult("");
    const res = await fetch("/api/admin/cache", { method: "DELETE" });
    if (res.ok) {
      const d = (await res.json()) as { deleted: number };
      setAllResult(`완료 · ${d.deleted}개 키 삭제`);
    } else {
      setAllResult("오류 발생");
    }
    setAllLoading(false);
  }

  const statusLabel = (s: string | undefined) => {
    if (s === "loading") return "처리 중...";
    if (s === "done") return "완료";
    if (s === "error") return "오류";
    return "";
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="admin-page-title mb-2">Redis 캐시 무효화</h1>
        <p className="admin-page-subtitle">
          캐시를 삭제하면 다음 요청 시 DB에서 새로 조회합니다.
        </p>
        {accessNotice && (
          <pre className="mt-3 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {accessNotice}
          </pre>
        )}
      </div>

      {isWorking && (
        <AdminLoadingState
          compact
          className="mb-4"
          title="캐시 작업을 처리하는 중입니다"
          description="요청한 캐시를 정리하고 있어요."
        />
      )}

      <div className="admin-card admin-card-padded space-y-3 mb-6">
        {CACHE_KEYS.map(({ key, label, desc }) => (
          <div
            key={key}
            className="flex items-center justify-between py-3 border-b border-[color:var(--admin-border)] last:border-b-0"
          >
            <div>
              <p className="text-sm font-medium text-[color:var(--admin-text)]">
                {label}
              </p>
              <p className="text-xs text-[color:var(--admin-text-muted)] font-mono mt-0.5">
                {desc}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {status[key] && status[key] !== "idle" && (
                <span
                  className={`text-xs font-medium ${
                    status[key] === "done"
                      ? "text-emerald-600"
                      : status[key] === "error"
                        ? "text-red-500"
                        : "text-[color:var(--admin-text-muted)]"
                  }`}
                >
                  {statusLabel(status[key])}
                </span>
              )}
              <button
                onClick={() => purgeOne(key)}
                disabled={status[key] === "loading"}
                className="admin-btn admin-btn-sm admin-btn-danger"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card admin-card-padded">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[color:var(--admin-text)]">
              전체 캐시 삭제
            </p>
            <p className="text-xs text-[color:var(--admin-text-muted)] mt-0.5">
              모든 Redis 캐시 키를 한 번에 삭제합니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {allResult && (
              <span className="text-xs text-[color:var(--admin-text-muted)]">
                {allResult}
              </span>
            )}
            <button
              onClick={purgeAll}
              disabled={allLoading}
              className="admin-btn admin-btn-danger-solid"
            >
              {allLoading ? "처리 중..." : "전체 삭제"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
