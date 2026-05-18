"use client";

import { useRef, useState } from "react";

type Phase = "idle" | "login" | "begin" | "count" | "chunk" | "done" | "error";

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

const TABLES: {
  key: "users" | "sites";
  tableName: string;
  title: string;
  desc: string;
}[] = [
  {
    key: "users",
    tableName: "loa_users",
    title: "캐릭터",
    desc: "전체 캐릭터 데이터를 프로덕션 DB로 동기화합니다. 기존 프로덕션 데이터는 모두 삭제됩니다.",
  },
  {
    key: "sites",
    tableName: "loa_sites",
    title: "사이트 모음",
    desc: "전체 사이트 데이터를 프로덕션 DB로 동기화합니다. 기존 프로덕션 데이터는 모두 삭제됩니다.",
  },
];

export default function SyncPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">서버 동기화 (Local → Prod)</h1>
        <p className="mt-2 text-sm text-gray-400">
          로컬 DB 내용을 프로덕션 DB로 그대로 복제합니다. 프로덕션 대상 테이블은{" "}
          <strong className="text-red-400">TRUNCATE</strong> 후 전체 삽입됩니다.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {TABLES.map((t) => (
          <SyncCard
            key={t.key}
            table={t.key}
            tableName={t.tableName}
            title={t.title}
            desc={t.desc}
          />
        ))}
      </div>
    </div>
  );
}

function SyncCard({
  table,
  tableName,
  title,
  desc,
}: {
  table: "users" | "sites";
  tableName: string;
  title: string;
  desc: string;
}) {
  const [state, setState] = useState<SyncState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const running =
    state.phase !== "idle" &&
    state.phase !== "done" &&
    state.phase !== "error";

  async function start() {
    const ok = window.confirm(
      `[${tableName} - ${title}]\n\n프로덕션의 해당 테이블을 전체 삭제 후 로컬 데이터로 다시 삽입합니다.\n계속하시겠습니까?`,
    );
    if (!ok) return;

    setState({ ...INITIAL, phase: "login", message: "시작 중..." });
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/admin/sync/${table}`, {
        method: "GET",
        signal: ctrl.signal,
        headers: { accept: "text/event-stream" },
      });
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
        error: (err as Error).message,
      }));
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setState((s) => ({ ...s, phase: "error", error: "사용자가 취소했습니다." }));
  }

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-md border border-blue-400/40 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-blue-300">
          {tableName}
        </span>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-gray-400">{desc}</p>

      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-xs text-gray-300">
          <span>
            진행:{" "}
            <strong>
              {state.transferred.toLocaleString()} / {state.total.toLocaleString()}
            </strong>
          </span>
          <span>{state.percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-gray-700">
          <div
            className={`h-full transition-all ${
              state.phase === "error"
                ? "bg-red-500"
                : state.phase === "done"
                  ? "bg-green-500"
                  : "bg-blue-500"
            }`}
            style={{ width: `${state.percent}%` }}
          />
        </div>
        <div className="text-xs">
          상태:{" "}
          <span
            className={
              state.phase === "error"
                ? "text-red-400"
                : state.phase === "done"
                  ? "text-green-400"
                  : "text-gray-300"
            }
          >
            {phaseLabel(state.phase)}
          </span>
          {state.message && <span className="text-gray-500"> · {state.message}</span>}
        </div>
        {state.error && (
          <pre className="whitespace-pre-wrap rounded bg-red-950/40 p-2 text-xs text-red-300">
            {state.error}
          </pre>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700"
        >
          {running ? "동기화 중..." : "서버로 동기화"}
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
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "idle":
      return "대기";
    case "login":
      return "인증";
    case "begin":
      return "TRUNCATE";
    case "count":
      return "카운트 조회";
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
