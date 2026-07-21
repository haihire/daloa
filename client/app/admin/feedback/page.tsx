"use client";

import { useCallback, useEffect, useState } from "react";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

interface Feedback {
  id: number;
  message: string;
  path: string;
  device_type: string;
  created_at: string;
}

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const role = useAdminRole();
  const isGuest = role === "guest";

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/feedback?page=${targetPage}&size=${PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { items: Feedback[]; total: number };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("피드백을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function remove(id: number) {
    if (isGuest) {
      alert(buildGuestNotice("피드백 삭제"));
      return;
    }
    if (!confirm("이 피드백을 삭제할까요? 되돌릴 수 없습니다.")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("failed");
      // 마지막 항목을 지워 페이지가 비면 한 페이지 앞으로 (page 변경이 재조회를 트리거)
      if (items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await load(page);
      }
    } catch {
      setError("삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="admin-page-title">사용자 피드백</h1>
      <p className="admin-page-subtitle">
        메인 페이지에서 방문자가 익명으로 남긴 의견입니다. (총 {total}건)
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[color:var(--admin-danger)] bg-[color:var(--admin-danger-soft)] px-4 py-3 text-sm text-[color:var(--admin-danger)]">
          {error}
        </div>
      )}

      <div className="admin-card mt-5 divide-y divide-[color:var(--admin-border)]">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-[color:var(--admin-text-muted)]">
            불러오는 중...
          </p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[color:var(--admin-text-muted)]">
            아직 등록된 피드백이 없습니다.
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="flex items-start justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--admin-text-muted)]">
                  <time dateTime={item.created_at}>
                    {formatDate(item.created_at)}
                  </time>
                  <span className="admin-badge admin-badge-neutral">
                    {item.device_type}
                  </span>
                  <span className="truncate">{item.path}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-[color:var(--admin-text)]">
                  {item.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={deletingId === item.id}
                className="shrink-0 rounded-lg border border-[color:var(--admin-danger)] px-3 py-1.5 text-xs font-medium text-[color:var(--admin-danger)] transition-colors hover:bg-[color:var(--admin-danger-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId === item.id ? "삭제 중..." : "삭제"}
              </button>
            </article>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-[color:var(--admin-border-strong)] px-3 py-1.5 text-sm text-[color:var(--admin-text)] transition-colors hover:bg-[color:var(--admin-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-[color:var(--admin-text-muted)]">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-[color:var(--admin-border-strong)] px-3 py-1.5 text-sm text-[color:var(--admin-text)] transition-colors hover:bg-[color:var(--admin-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
