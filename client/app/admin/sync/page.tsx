"use client";

import { useEffect, useRef, useState } from "react";
import { AdminLoadingState } from "@/app/admin/_components/AdminLoadingState";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

type Phase = "idle" | "login" | "begin" | "count" | "chunk" | "done" | "error";
type SyncDirection = "local-to-prod" | "prod-to-local";

interface SyncState {
  phase: Phase;
  total: number;
  transferred: number;
  percent: number;
  message: string;
  error: string;
}

const INITIAL: SyncState = {
  phase: "idle",
  total: 0,
  transferred: 0,
  percent: 0,
  message: "",
  error: "",
};

const TABLES: { key: "users" | "sites"; label: string; desc: string }[] = [
  {
    key: "users",
    label: "loa_users (캐릭터)",
    desc: "선택한 방향 기준으로 전체 데이터를 다시 동기화합니다.",
  },
  {
    key: "sites",
    label: "loa_sites (사이트 모음)",
    desc: "선택한 방향 기준으로 전체 데이터를 다시 동기화합니다.",
  },
];

export default function SyncPage() {
  const [showForm, setShowForm] = useState(false);
  const [activeTable, setActiveTable] = useState<"users" | "sites" | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<SyncDirection>("local-to-prod");
  const [accessNotice, setAccessNotice] = useState("");
  const [state, setState] = useState<SyncState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const role = useAdminRole();
  const isGuest = role === "guest";

  useEffect(() => {
    const host = window.location.hostname;
    const isLocalHost =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    setDirection(isLocalHost ? "local-to-prod" : "prod-to-local");
  }, []);

  const running =
    state.phase !== "idle" && state.phase !== "done" && state.phase !== "error";

  const directionLabel =
    direction === "local-to-prod" ? "프로덕션으로 동기화" : "로컬과 동기화";

  function requireMaster(action: string) {
    if (!isGuest) return true;
    setAccessNotice(buildGuestNotice(action));
    return false;
  }

  const handleSyncClick = (tableKey: "users" | "sites") => {
    if (!requireMaster("DB 동기화")) return;
    const table = TABLES.find((item) => item.key === tableKey);
    const actionText =
      direction === "local-to-prod"
        ? "프로덕션 테이블을 비우고 로컬 데이터를 복사합니다."
        : "로컬 테이블을 비우고 프로덕션 데이터를 복사합니다.";
    const ok = window.confirm(
      `[${table?.label ?? tableKey}] (${directionLabel})\n\n${actionText}\n계속하시겠습니까?`,
    );
    if (!ok) return;

    setActiveTable(tableKey);
    setError("");
    setShowForm(true);
  };

  async function start(sessionId: string) {
    if (!activeTable) return;

    setState({
      ...INITIAL,
      phase: "login",
      message: `${directionLabel} 준비 중...`,
    });
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(
        `/api/admin/sync/${activeTable}?sessionId=${encodeURIComponent(sessionId)}&direction=${encodeURIComponent(direction)}`,
        {
          method: "GET",
          signal: ctrl.signal,
          headers: { accept: "text/event-stream" },
        },
      );
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`연결 실패 (${res.status}): ${txt}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleEvent(raw, setState);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((s) => ({
        ...s,
        phase: "error",
        error:
          err instanceof Error
            ? err.message
            : "동기화 중 오류가 발생했습니다.",
      }));
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setState((s) => ({ ...s, phase: "error", error: "사용자가 취소했습니다." }));
  }

  async function syncCheck(u: string, p: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sync/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        role?: string;
        message?: string;
      };

      if (!res.ok) {
        setError(data.message ?? "로그인 실패");
        return;
      }
      if (!data.sessionId) {
        setError("인증 세션 정보가 없습니다.");
        return;
      }

      setShowForm(false);
      await start(data.sessionId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "원격 관리자 인증 중 오류가 발생했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await syncCheck(username, password);
  }

  return (
    <div>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">서버 동기화</h1>
          <p className="mt-2 text-sm text-gray-400">
            동기화 방향을 선택한 뒤 실행합니다. 대상 테이블은{" "}
            <strong className="text-red-400">TRUNCATE</strong> 후 전체 복사됩니다.
          </p>
          {accessNotice && (
            <pre className="mt-3 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {accessNotice}
            </pre>
          )}
        </header>

        {loading && (
          <AdminLoadingState
            compact
            title="DB 동기화 상태를 확인하는 중입니다"
            description="대상 서버와 테이블 상태를 확인하고 있어요."
          />
        )}

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            disabled={running}
            onClick={() => setDirection("local-to-prod")}
            className={`rounded px-3 py-2 ${
              direction === "local-to-prod"
                ? "bg-blue-700 text-white"
                : "bg-gray-800 text-gray-300"
            }`}
          >
            프로덕션으로 동기화
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => setDirection("prod-to-local")}
            className={`rounded px-3 py-2 ${
              direction === "prod-to-local"
                ? "bg-blue-700 text-white"
                : "bg-gray-800 text-gray-300"
            }`}
          >
            로컬과 동기화
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {TABLES.map((t) => {
            const tableState = activeTable === t.key ? state : INITIAL;
            return (
              <section
                className="rounded-xl border border-gray-700 bg-gray-900 p-5"
                key={t.key}
              >
                <h2 className="text-lg font-semibold text-gray-100">{t.label}</h2>
                <p className="mt-1 text-xs text-gray-400">{t.desc}</p>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs text-gray-300">
                    <span>
                      진행:{" "}
                      <strong>
                        {tableState.transferred.toLocaleString()} /{" "}
                        {tableState.total.toLocaleString()}
                      </strong>
                    </span>
                    <span>{tableState.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-gray-700">
                    <div
                      className={`h-full transition-all ${
                        tableState.phase === "error"
                          ? "bg-red-500"
                          : tableState.phase === "done"
                            ? "bg-green-500"
                            : "bg-blue-500"
                      }`}
                      style={{ width: `${tableState.percent}%` }}
                    />
                  </div>
                  <div className="text-xs">
                    상태:{" "}
                    <span
                      className={
                        tableState.phase === "error"
                          ? "text-red-400"
                          : tableState.phase === "done"
                            ? "text-green-400"
                            : "text-gray-300"
                      }
                    >
                      {phaseLabel(tableState.phase)}
                    </span>
                    {tableState.message && (
                      <span className="text-gray-500"> · {tableState.message}</span>
                    )}
                  </div>
                  {tableState.error && (
                    <pre className="whitespace-pre-wrap rounded bg-red-950/40 p-2 text-xs text-red-300">
                      {tableState.error}
                    </pre>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSyncClick(t.key)}
                    disabled={running}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700"
                  >
                    {running ? "동기화 중..." : "서버와 동기화"}
                  </button>
                  {running && (
                    <button
                      type="button"
                      onClick={cancel}
                      className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                    >
                      취소
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {showForm && (
          <div className="admin-modal-overlay">
            <div className="admin-modal w-full max-w-md p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="admin-label">아이디</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label">비밀번호</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="admin-input"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="admin-btn admin-btn-secondary flex-1"
                    disabled={loading}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="admin-btn admin-btn-primary flex-1"
                  >
                    {loading ? "확인 중..." : "인증 후 동기화"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "idle":
      return "대기";
    case "login":
      return "원격 관리자 인증";
    case "begin":
      return "TRUNCATE";
    case "count":
      return "건수 조회";
    case "chunk":
      return "전송 중";
    case "done":
      return "완료";
    case "error":
      return "오류";
  }
}

function handleEvent(
  raw: string,
  setState: React.Dispatch<React.SetStateAction<SyncState>>,
) {
  const lines = raw.split("\n");
  let evt = "message";
  let dataStr = "";
  for (const line of lines) {
    if (line.startsWith("event:")) evt = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    return;
  }

  setState((s) => {
    const next = { ...s };
    if (evt === "progress") {
      if (typeof data.phase === "string") next.phase = data.phase as Phase;
      if (typeof data.total === "number") next.total = data.total;
      if (typeof data.transferred === "number") next.transferred = data.transferred;
      if (typeof data.percent === "number") next.percent = data.percent;
      if (typeof data.message === "string") next.message = data.message;
    } else if (evt === "done") {
      next.phase = "done";
      next.percent = 100;
      if (typeof data.total === "number") next.total = data.total;
      if (typeof data.transferred === "number") next.transferred = data.transferred;
      next.message = "동기화 완료";
    } else if (evt === "error") {
      next.phase = "error";
      next.error = (data.message as string) ?? "알 수 없는 오류";
    }
    return next;
  });
}
