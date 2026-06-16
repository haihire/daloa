"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ContainerStat {
  name: string;
  label: string;
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
}

interface ContainerStatus {
  name: string;
  label: string;
  state: string;
  status: string;
  health: string;
}

interface HostStats {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskPercent: number;
}

interface ContainerHistoryPoint {
  bucket: string;
  avgCpu: number;
  avgMem: number;
  avgMemUsedMb: number;
}

interface ContainersResponse {
  containers: ContainerStat[];
  host: HostStats | null;
  statuses: ContainerStatus[];
}

interface AiDiagnosis {
  summary: string;
  anomalies: string[];
  costSuggestions: string[];
  generatedAt: string;
  model: string;
  ec2: { instanceType: string | null; region: string };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// 채팅 시작용 예시 버튼. diagnosis=true 는 구조화 진단 엔드포인트 호출.
const QUICK_PROMPTS: { label: string; prompt?: string; diagnosis?: boolean }[] =
  [
    { label: "종합 AI 진단", diagnosis: true },
    {
      label: "CPU 사용량",
      prompt:
        "각 컨테이너의 최근 7일 CPU 사용량(평균/최대/최소/p95)을 표로 요약해줘.",
    },
    {
      label: "메모리 상태",
      prompt: "컨테이너별 메모리 사용 상태와 여유가 충분한지 알려줘.",
    },
    {
      label: "현재 월 예상 요금",
      prompt: "현재 인스턴스 기준 월 예상 요금과 그 내역을 알려줘.",
    },
    {
      label: "비용 절감 방법",
      prompt: "지금 사용량 기준으로 AWS 비용을 줄일 방법을 제안해줘.",
    },
    {
      label: "CPU 스파이크 원인",
      prompt:
        "특정 시간대에 CPU가 튀는 구간이 있는지, 있다면 최근 배포/재시작 이력과 연결해 원인과 대응을 알려줘.",
    },
  ];

function formatDiagnosis(d: AiDiagnosis): string {
  const blocks = [`📋 현황 요약\n${d.summary || "—"}`];
  if (d.anomalies.length > 0) {
    blocks.push(`⚠️ 이상 징후\n${d.anomalies.map((a) => `• ${a}`).join("\n")}`);
  }
  if (d.costSuggestions.length > 0) {
    blocks.push(
      `💰 비용 절감 제안\n${d.costSuggestions.map((s) => `• ${s}`).join("\n")}`,
    );
  }
  const where = d.ec2.instanceType
    ? `${d.ec2.instanceType} · ${d.ec2.region}`
    : "EC2 정보 없음";
  blocks.push(`— ${where}`);
  return blocks.join("\n\n");
}

// 카드 정렬 순서 (서비스 의존도 순)
const LABEL_ORDER = ["nest", "nginx", "redis", "postgres"];
const HISTORY_TABS = ["nest", "nginx", "redis", "postgres"] as const;

let containersCache: ContainerStat[] | null = null;
let statusesCache: ContainerStatus[] | null = null;
let hostCache: HostStats | null = null;
const containerHistoryCache: Record<string, ContainerHistoryPoint[]> = {};

function barColor(pct: number): string {
  if (pct >= 85) return "#ef4444";
  if (pct >= 60) return "#f59e0b";
  return "#2563eb";
}

function UsageBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, background: barColor(clamped) }}
      />
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: "실행 중", cls: "admin-badge-success" },
    exited: { label: "중지됨", cls: "admin-badge-danger" },
    restarting: { label: "재시작 중", cls: "admin-badge-warning" },
    paused: { label: "일시정지", cls: "admin-badge-warning" },
    created: { label: "생성됨", cls: "admin-badge-neutral" },
  };
  const item = map[state] ?? {
    label: state || "알 수 없음",
    cls: "admin-badge-neutral",
  };
  return <span className={`admin-badge ${item.cls}`}>{item.label}</span>;
}

function HealthDot({ health }: { health: string }) {
  if (!health) return null;
  const color =
    health === "healthy"
      ? "#22c55e"
      : health === "unhealthy"
        ? "#ef4444"
        : "#f59e0b";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--admin-text-muted)]">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {health}
    </span>
  );
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<ContainerStat[]>(
    containersCache ?? [],
  );
  const [statuses, setStatuses] = useState<ContainerStatus[]>(
    statusesCache ?? [],
  );
  const [host, setHost] = useState<HostStats | null>(hostCache);
  const [loading, setLoading] = useState(containersCache === null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [historyTab, setHistoryTab] = useState<string>("nest");
  const [containerHistory, setContainerHistory] = useState<
    ContainerHistoryPoint[]
  >(containerHistoryCache["nest"] ?? []);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeChart, setActiveChart] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 메시지가 있을 때만 스크롤 (마운트 시 페이지가 챗봇으로 끌려가는 것 방지)
    if (messages.length === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || chatLoading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setChatInput("");
    setChatLoading(true);
    setChatError("");
    try {
      const res = await fetch("/api/admin/monitoring/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        message?: string;
      };
      if (!res.ok) {
        setChatError(data.message ?? "응답을 받지 못했습니다.");
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "(빈 응답)" },
      ]);
    } catch {
      setChatError("요청 중 오류가 발생했습니다.");
    } finally {
      setChatLoading(false);
    }
  }

  // "종합 AI 진단" — 구조화 진단 엔드포인트를 호출해 메시지로 표시
  async function runDiagnosis() {
    if (chatLoading) return;
    setMessages((m) => [...m, { role: "user", content: "종합 AI 진단" }]);
    setChatLoading(true);
    setChatError("");
    try {
      const res = await fetch("/api/admin/monitoring/ai-diagnosis", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as
        | AiDiagnosis
        | { message?: string };
      if (!res.ok) {
        setChatError(
          ("message" in data && data.message) || "AI 진단에 실패했습니다.",
        );
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: formatDiagnosis(data as AiDiagnosis) },
      ]);
    } catch {
      setChatError("AI 진단 요청 중 오류가 발생했습니다.");
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    async function loadContainers() {
      try {
        const res = await fetch("/api/admin/monitoring/containers", {
          cache: "no-store",
        });
        if (!alive || !res.ok) return;
        const raw = (await res.json()) as ContainersResponse | ContainerStat[];
        const parsed: ContainersResponse = Array.isArray(raw)
          ? { containers: raw, host: null, statuses: [] }
          : {
              containers: raw.containers ?? [],
              host: raw.host ?? null,
              statuses: raw.statuses ?? [],
            };
        containersCache = parsed.containers;
        statusesCache = parsed.statuses;
        hostCache = parsed.host;
        setContainers(parsed.containers);
        setStatuses(parsed.statuses);
        setHost(parsed.host);
        setUpdatedAt(new Date());
      } catch {
        // keep previous snapshot
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadContainers();
    const timer = setInterval(() => void loadContainers(), 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const cached = containerHistoryCache[historyTab];
    if (cached) {
      setContainerHistory(cached);
    } else {
      setHistoryLoading(true);
      setContainerHistory([]);
    }
    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/admin/monitoring/container-history?container=${historyTab}`,
          { cache: "no-store" },
        );
        if (!alive || !res.ok) return;
        const data = (await res.json()) as ContainerHistoryPoint[];
        containerHistoryCache[historyTab] = data;
        setContainerHistory(data);
      } catch {
        // keep previous
      } finally {
        if (alive) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      alive = false;
    };
  }, [historyTab]);

  // 상태(statuses) + 자원(containers)을 label 기준으로 병합. 중지된 컨테이너도 표시.
  const cards = useMemo(() => {
    const byLabel = new Map<
      string,
      { label: string; status?: ContainerStatus; stat?: ContainerStat }
    >();
    for (const s of statuses) {
      byLabel.set(s.label, { ...byLabel.get(s.label), label: s.label, status: s });
    }
    for (const c of containers) {
      byLabel.set(c.label, { ...byLabel.get(c.label), label: c.label, stat: c });
    }
    return [...byLabel.values()].sort((a, b) => {
      const ai = LABEL_ORDER.indexOf(a.label);
      const bi = LABEL_ORDER.indexOf(b.label);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }, [containers, statuses]);

  const runningCount = useMemo(
    () =>
      cards.filter((c) =>
        c.status ? c.status.state === "running" : Boolean(c.stat),
      ).length,
    [cards],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="admin-page-title">컨테이너 현황</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-1 text-xs text-[color:var(--admin-text-muted)]">
          {cards.length > 0 && (
            <span>
              실행 중{" "}
              <span className="font-semibold text-[color:var(--admin-text)]">
                {runningCount}
              </span>
              {" / "}
              {cards.length}
            </span>
          )}
          {updatedAt && (
            <span>
              업데이트 {updatedAt.toLocaleTimeString("ko-KR", { hour12: false })}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="admin-loading-box admin-loading-box-compact mb-4 shrink-0">
          <p className="text-sm text-[color:var(--admin-text-muted)]">
            컨테이너 지표를 불러오는 중입니다...
          </p>
        </div>
      )}

      {!loading && cards.length === 0 && !host ? (
        <div className="admin-card admin-card-padded">
          <p className="text-sm text-[color:var(--admin-text-muted)]">
            컨테이너 데이터 없음 (EC2 환경에서만 표시됩니다)
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {/* EC2 호스트 */}
          {host && (
            <div className="admin-card p-4">
              <p className="mb-3 text-sm font-semibold">EC2 호스트 전체</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[color:var(--admin-text-muted)]">
                      CPU
                    </span>
                    <span className="font-semibold tabular-nums">
                      {host.cpuPercent.toFixed(1)}%
                    </span>
                  </div>
                  <UsageBar pct={host.cpuPercent} />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[color:var(--admin-text-muted)]">
                      메모리
                    </span>
                    <span className="font-semibold tabular-nums">
                      {host.memPercent.toFixed(1)}%
                    </span>
                  </div>
                  <UsageBar pct={host.memPercent} />
                  <p className="mt-1 text-[11px] text-[color:var(--admin-text-muted)] tabular-nums">
                    {host.memUsedMb}MB / {host.memTotalMb}MB
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[color:var(--admin-text-muted)]">
                      디스크
                    </span>
                    <span className="font-semibold tabular-nums">
                      {host.diskPercent}%
                    </span>
                  </div>
                  <UsageBar pct={host.diskPercent} />
                  <p className="mt-1 text-[11px] text-[color:var(--admin-text-muted)] tabular-nums">
                    {host.diskUsedGb}GB / {host.diskTotalGb}GB
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 컨테이너 카드 */}
          {cards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map(({ label, status, stat }) => (
                <div key={label} className="admin-card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">{label}</p>
                    {status ? (
                      <StateBadge state={status.state} />
                    ) : stat ? (
                      <StateBadge state="running" />
                    ) : null}
                  </div>

                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-[color:var(--admin-text-muted)]">
                      {status?.status || (stat ? "실행 중" : "—")}
                    </span>
                    {status && <HealthDot health={status.health} />}
                  </div>

                  {stat ? (
                    <div className="space-y-2">
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[11px]">
                          <span className="text-[color:var(--admin-text-muted)]">
                            CPU
                          </span>
                          <span className="font-medium tabular-nums">
                            {stat.cpuPercent.toFixed(1)}%
                          </span>
                        </div>
                        <UsageBar pct={stat.cpuPercent} />
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[11px]">
                          <span className="text-[color:var(--admin-text-muted)]">
                            메모리
                          </span>
                          <span className="font-medium tabular-nums">
                            {stat.memPercent.toFixed(1)}%
                          </span>
                        </div>
                        <UsageBar pct={stat.memPercent} />
                        <p className="mt-0.5 text-[10px] text-[color:var(--admin-text-muted)] tabular-nums">
                          {stat.memUsedMb}MB / {stat.memTotalMb}MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[color:var(--admin-text-subtle)]">
                      자원 데이터 없음
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 7일 추세 */}
          <div className="admin-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">자원 추세 (7일)</p>
              <div className="flex gap-1">
                {HISTORY_TABS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setHistoryTab(name)}
                    className={`admin-btn admin-btn-sm ${historyTab === name ? "admin-btn-primary" : "admin-btn-secondary"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-[color:var(--admin-text-muted)]">
                  CPU %
                </p>
                <div className="h-32">
                  {historyLoading ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      불러오는 중...
                    </div>
                  ) : containerHistory.length === 0 ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      데이터 없음
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={containerHistory}
                        onMouseEnter={() => setActiveChart("container-cpu")}
                        onMouseLeave={() => setActiveChart(null)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 9, fill: "#6b7280" }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#6b7280" }}
                          unit="%"
                        />
                        <Tooltip
                          active={activeChart === "container-cpu"}
                          formatter={(v) => [`${v ?? 0}%`, "CPU"]}
                          wrapperStyle={{ pointerEvents: "none" }}
                        />
                        <Area
                          type="linear"
                          dataKey="avgCpu"
                          stroke="#2563eb"
                          fill="#bfdbfe"
                          name="CPU %"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-[color:var(--admin-text-muted)]">
                  메모리 %
                </p>
                <div className="h-32">
                  {historyLoading ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      불러오는 중...
                    </div>
                  ) : containerHistory.length === 0 ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      데이터 없음
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={containerHistory}
                        onMouseEnter={() => setActiveChart("container-mem")}
                        onMouseLeave={() => setActiveChart(null)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 9, fill: "#6b7280" }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#6b7280" }}
                          unit="%"
                        />
                        <Tooltip
                          active={activeChart === "container-mem"}
                          formatter={(v) => [`${v ?? 0}%`, "메모리"]}
                          wrapperStyle={{ pointerEvents: "none" }}
                        />
                        <Area
                          type="linear"
                          dataKey="avgMem"
                          stroke="#7c3aed"
                          fill="#ede9fe"
                          name="메모리 %"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* AI 운영 챗봇 */}
          <div className="admin-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">AI 운영 챗봇</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--admin-text-muted)]">
                컨테이너 자원·EC2 비용·최근 배포 이력을 바탕으로 질문에
                답합니다. (민감정보는 관리자만)
              </p>
            </div>

            <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-sm text-[color:var(--admin-text-muted)]">
                  아래 버튼을 누르거나 직접 질문을 입력해보세요.
                </p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === "user" ? "text-right" : "text-left"}
                  >
                    <span
                      className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${
                        m.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-[color:var(--admin-text)]"
                      }`}
                    >
                      {m.content}
                    </span>
                  </div>
                ))
              )}
              {chatLoading && (
                <p className="text-xs text-[color:var(--admin-text-muted)]">
                  답변 생성 중...
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <p className="mb-2 text-sm text-red-500">{chatError}</p>
            )}

            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={chatLoading}
                  onClick={() =>
                    q.diagnosis ? runDiagnosis() : sendMessage(q.prompt ?? "")
                  }
                  className="admin-btn admin-btn-sm admin-btn-secondary"
                >
                  {q.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(chatInput);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
                placeholder="질문을 입력하세요"
                className="admin-input flex-1"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="admin-btn admin-btn-primary shrink-0"
              >
                전송
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
