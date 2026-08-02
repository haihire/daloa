"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateAxis } from "@/lib/chart-ticks";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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

interface DeployEvent {
  service: string;
  eventType: string;
  detail: string | null;
  occurredAt: string;
}

// 호스트 전체를 "4개 컨테이너 / 도커 자체 / 기타(OS 등)"로 쪼갠 값. cpuPercent는 모두
// 호스트 전체 용량 기준 0~100 스케일로 정규화돼 있어 그대로 적층해서 보여줄 수 있다.
interface ResourceBreakdown {
  hostCpuPercent: number;
  hostMemUsedMb: number;
  hostMemTotalMb: number;
  containers: Array<{
    label: string;
    cpuPercent: number;
    memUsedMb: number;
    diskUsedMb: number;
  }>;
  dockerOverheadCpuPercent: number;
  dockerOverheadMemMb: number;
  dockerOverheadDiskMb: number;
  osOtherCpuPercent: number;
  osOtherMemMb: number;
  osOtherDiskMb: number;
}

interface ResourceBreakdownHistoryPoint {
  bucket: string;
  nestCpu: number;
  nestMemMb: number;
  nginxCpu: number;
  nginxMemMb: number;
  redisCpu: number;
  redisMemMb: number;
  postgresCpu: number;
  postgresMemMb: number;
  dockerOverheadCpu: number;
  dockerOverheadMemMb: number;
  osOtherCpu: number;
  osOtherMemMb: number;
  hostCpu: number;
}

interface ContainersResponse {
  containers: ContainerStat[];
  host: HostStats | null;
  statuses: ContainerStatus[];
  breakdown: ResourceBreakdown | null;
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

/** 챗봇이 벡터 검색으로 참고하는 과거 운영 스냅샷 문서 */
interface RagDocument {
  id: string;
  title: string;
  source: string;
  period_start: string;
  period_end: string;
  created_at: string;
  chunk_count: string;
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
      label: "정확한 현재 예상 요금",
      prompt: "지금 인스턴스 기준 정확한 현재 예상 요금과 그 산출 내역을 알려줘.",
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
    {
      label: "크레딧 상태",
      prompt: "지금 CPU 크레딧 잔액과 시간당 소모량을 알려주고, 여유가 있는지 판단해줘.",
    },
    {
      label: "방문자 추이",
      prompt: "최근 7일 방문자 수와 이전 7일 대비 증감을 알려줘.",
    },
  ];

// 마침표/느낌표/물음표 뒤에 공백이 와야 문장 끝으로 본다.
// "4.2%", "t3.micro", "$9.49"처럼 점 뒤에 공백 없이 문자가 오는 경우는 쪼개지 않는다.
// split은 매칭 여부와 무관하게 전체 문자열을 보존하므로(마지막 조각 포함),
// 종결부호가 하나도 없거나 마지막 문장에 부호가 없어도 텍스트가 유실되지 않는다.
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDiagnosis(d: AiDiagnosis): string {
  // ### 로 마크다운 헤딩을 만든다 — 답변이 이제 ReactMarkdown으로 렌더링되므로
  // 그냥 텍스트 라벨보다 실제 소제목으로 보이게 한다.
  const summarySentences = splitSentences(d.summary || "");
  const summaryBlock =
    summarySentences.length > 0
      ? summarySentences.map((s) => `- ${s}`).join("\n")
      : "- —";
  const blocks = [`### 현황 요약\n\n${summaryBlock}`];
  if (d.anomalies.length > 0) {
    // "이상 징후"가 아니라 "특이사항"으로 표기 — AI가 이상 신호뿐 아니라 배포·크레딧·
    // 트래픽 등 그때그때 다른 주목할 내용도 담게 돼서 "이상"이라는 라벨이 안 맞을 수 있다.
    blocks.push(
      `### 특이사항\n\n${d.anomalies.map((a) => `- ${a}`).join("\n")}`,
    );
  }
  if (d.costSuggestions.length > 0) {
    blocks.push(
      `### 비용 절감 제안\n\n${d.costSuggestions.map((s) => `- ${s}`).join("\n")}`,
    );
  }
  return blocks.join("\n\n");
}

// AI 답변(마크다운)을 채팅 말풍선 크기에 맞게 렌더링하기 위한 컴포넌트 매핑.
// react-markdown은 dangerouslySetInnerHTML을 쓰지 않고 React 엘리먼트로 직접
// 변환하므로, AI가 생성한 텍스트를 그대로 렌더링해도 XSS 위험이 없다.
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  // <em>은 기본적으로 이탤릭 스타일이 붙는데, 내용은 살리고 기울임만 없앤다.
  em: ({ children }) => <span>{children}</span>,
  h1: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[12px]">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 underline"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-200">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-slate-300 px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-300 px-2 py-1">{children}</td>
  ),
};

// 카드 정렬 순서 (서비스 의존도 순)
const LABEL_ORDER = ["nest", "nginx", "redis", "postgres"];
const HISTORY_TABS = ["전체", "nest", "nginx", "redis", "postgres"] as const;

// dataviz 스킬 카테고리 팔레트(1~6번 슬롯, 인접쌍 CVD 검증 통과 순서 그대로 사용).
// 세그먼트가 잘 안 보이는 3개(redis/postgres/dockerOverhead)는 범례 텍스트로 항상 값을 병기해 보완한다.
const SERIES_META = {
  nest: { label: "nest", color: "#2a78d6" },
  nginx: { label: "nginx", color: "#eb6834" },
  redis: { label: "redis", color: "#1baf7a" },
  postgres: { label: "postgres", color: "#eda100" },
  dockerOverhead: { label: "docker", color: "#e87ba4" },
  osOther: { label: "OS", color: "#008300" },
} as const;

const CPU_HISTORY_SERIES: Array<{
  key: keyof ResourceBreakdownHistoryPoint;
  meta: (typeof SERIES_META)[keyof typeof SERIES_META];
}> = [
  { key: "nestCpu", meta: SERIES_META.nest },
  { key: "nginxCpu", meta: SERIES_META.nginx },
  { key: "redisCpu", meta: SERIES_META.redis },
  { key: "postgresCpu", meta: SERIES_META.postgres },
  { key: "dockerOverheadCpu", meta: SERIES_META.dockerOverhead },
  { key: "osOtherCpu", meta: SERIES_META.osOther },
];

const MEM_HISTORY_SERIES: Array<{
  key: keyof ResourceBreakdownHistoryPoint;
  meta: (typeof SERIES_META)[keyof typeof SERIES_META];
}> = [
  { key: "nestMemMb", meta: SERIES_META.nest },
  { key: "nginxMemMb", meta: SERIES_META.nginx },
  { key: "redisMemMb", meta: SERIES_META.redis },
  { key: "postgresMemMb", meta: SERIES_META.postgres },
  { key: "dockerOverheadMemMb", meta: SERIES_META.dockerOverhead },
  { key: "osOtherMemMb", meta: SERIES_META.osOther },
];

let containersCache: ContainerStat[] | null = null;
let statusesCache: ContainerStatus[] | null = null;
let hostCache: HostStats | null = null;
let breakdownCache: ResourceBreakdown | null = null;
let breakdownHistoryCache: ResourceBreakdownHistoryPoint[] | null = null;
const containerHistoryCache: Record<string, ContainerHistoryPoint[]> = {};

/**
 * CPU/메모리 구성을 막대(너비=비율)로 보여주면, 값이 작을 때(EC2 유휴 상태 등) 세그먼트가
 * 안 보이는 문제가 있었다. 대신 항목별로 숫자를 큼직하게 보여주는 타일 그리드로 표시 —
 * 값의 크기와 무관하게 항상 읽힌다.
 */
function StatGrid({
  title,
  segments,
  formatSegment,
  renderTotal,
}: {
  title: string;
  segments: { key: string; label: string; value: number; color: string }[];
  formatSegment: (value: number) => string;
  renderTotal: (sum: number) => string;
}) {
  const sum = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-[color:var(--admin-text-muted)]">{title}</span>
        <span className="font-semibold tabular-nums">{renderTotal(sum)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="rounded-lg border border-[color:var(--admin-border)] px-2.5 py-2"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[color:var(--admin-text-muted)]">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: seg.color }}
              />
              <span className="truncate">{seg.label}</span>
            </div>
            <div className="text-base font-bold tabular-nums text-[color:var(--admin-text)]">
              {formatSegment(seg.value)}
            </div>
          </div>
        ))}
      </div>
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
  const [breakdown, setBreakdown] = useState<ResourceBreakdown | null>(
    breakdownCache,
  );
  const [loading, setLoading] = useState(containersCache === null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [deployEvents, setDeployEvents] = useState<DeployEvent[]>([]);
  const [deployEventsLoaded, setDeployEventsLoaded] = useState(false);
  const [deployEventsLoading, setDeployEventsLoading] = useState(false);
  const [deployEventsOpen, setDeployEventsOpen] = useState(false);
  const deployEventsRef = useRef<HTMLDivElement | null>(null);

  const [historyTab, setHistoryTab] =
    useState<(typeof HISTORY_TABS)[number]>("전체");
  const [containerHistory, setContainerHistory] = useState<
    ContainerHistoryPoint[]
  >([]);
  const [breakdownHistory, setBreakdownHistory] = useState<
    ResourceBreakdownHistoryPoint[]
  >(breakdownHistoryCache ?? []);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeChart, setActiveChart] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [chatError, setChatError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  /**
   * 서버가 실제로 지금 뭘 하는지 실시간으로 알려주는 게 아니라(단일 응답 REST 호출이라
   * 중간 진행 상황을 보낼 방법이 없다), 그동안 관측된 소요 시간(임베딩·RAG 검색은
   * 1초 내외, 나머지는 대부분 LLM 응답 대기)에 맞춰 타이밍만 흉내낸 단계 표시다.
   * 반환값을 finally에서 호출해 남은 타이머를 정리한다.
   */
  function startStagedLoading(stages: [delayMs: number, text: string][]) {
    setLoadingStage(stages[0]?.[1] ?? "");
    const timers = stages
      .slice(1)
      .map(([delay, text]) => setTimeout(() => setLoadingStage(text), delay));
    return () => timers.forEach(clearTimeout);
  }

  async function copyMessage(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex((cur) => (cur === index ? null : cur));
      }, 1500);
    } catch {
      // 클립보드 권한 거부/미지원 — 드래그 선택으로도 복사 가능하니 조용히 무시
    }
  }

  // RAG 지식베이스: 챗봇이 참고하는 과거 운영 스냅샷 문서.
  // 생성은 매주 월요일 04:00(KST) 크론이 자동으로 한다(RagSnapshotCronService) —
  // 여기선 뭐가 쌓였는지 조회만 한다.
  const [ragDocs, setRagDocs] = useState<RagDocument[]>([]);

  const loadRagDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/monitoring/rag/documents");
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (Array.isArray(data)) setRagDocs(data as RagDocument[]);
    } catch {
      // 지식베이스는 부가 기능 — 조회 실패해도 페이지는 그대로 동작
    }
  }, []);

  useEffect(() => {
    void loadRagDocs();
  }, [loadRagDocs]);

  // 배포/재시작 이력 — "업데이트 HH:MM"은 그냥 브라우저가 마지막으로 폴링에 성공한
  // 시각일 뿐 DB 기록이 아니라서, 실제 DB에 남는 이력(container_events)은 드롭다운으로
  // 따로 보여준다. 처음 열 때 1회만 불러온다(그 뒤엔 캐시된 목록 재사용).
  const loadDeployEvents = useCallback(async () => {
    setDeployEventsLoading(true);
    try {
      const res = await fetch("/api/admin/monitoring/deploy-events", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as DeployEvent[];
        setDeployEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      // 부가 정보 — 조회 실패해도 페이지는 그대로 동작
    } finally {
      setDeployEventsLoading(false);
      setDeployEventsLoaded(true);
    }
  }, []);

  function toggleDeployEvents() {
    setDeployEventsOpen((open) => {
      const next = !open;
      if (next && !deployEventsLoaded) void loadDeployEvents();
      return next;
    });
  }

  useEffect(() => {
    if (!deployEventsOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!deployEventsRef.current?.contains(e.target as Node)) {
        setDeployEventsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [deployEventsOpen]);

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
    const stopStaging = startStagedLoading([
      [0, "질문을 이해하는 중..."],
      [800, "관련 기록 검색 중..."],
      [2200, "AI가 답변 작성 중..."],
    ]);
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
      stopStaging();
      setLoadingStage("");
      setChatLoading(false);
    }
  }

  // "종합 AI 진단" — 구조화 진단 엔드포인트를 호출해 메시지로 표시
  async function runDiagnosis() {
    if (chatLoading) return;
    setMessages((m) => [...m, { role: "user", content: "종합 AI 진단" }]);
    setChatLoading(true);
    setChatError("");
    const stopStaging = startStagedLoading([
      [0, "운영 데이터 수집 중..."],
      [1200, "AI가 진단 작성 중..."],
    ]);
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
      stopStaging();
      setLoadingStage("");
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
          ? { containers: raw, host: null, statuses: [], breakdown: null }
          : {
              containers: raw.containers ?? [],
              host: raw.host ?? null,
              statuses: raw.statuses ?? [],
              breakdown: raw.breakdown ?? null,
            };
        containersCache = parsed.containers;
        statusesCache = parsed.statuses;
        hostCache = parsed.host;
        breakdownCache = parsed.breakdown;
        setContainers(parsed.containers);
        setStatuses(parsed.statuses);
        setHost(parsed.host);
        setBreakdown(parsed.breakdown);
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
    if (historyTab === "전체") return;
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

  // "전체" 탭: 컨테이너 4개 + 도커 자체 + 기타(OS)를 한 번에 보여주는 적층 추세.
  useEffect(() => {
    if (historyTab !== "전체") return;
    let alive = true;
    if (breakdownHistoryCache) {
      setBreakdownHistory(breakdownHistoryCache);
    } else {
      setHistoryLoading(true);
      setBreakdownHistory([]);
    }
    async function loadBreakdownHistory() {
      try {
        const res = await fetch(
          "/api/admin/monitoring/resource-breakdown-history",
          { cache: "no-store" },
        );
        if (!alive || !res.ok) return;
        const data = (await res.json()) as ResourceBreakdownHistoryPoint[];
        breakdownHistoryCache = data;
        setBreakdownHistory(data);
      } catch {
        // keep previous
      } finally {
        if (alive) setHistoryLoading(false);
      }
    }
    void loadBreakdownHistory();
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

  // breakdown.containers는 실행 중인 것만 담겨 오므로, 죽은 컨테이너는 0으로 채운다.
  const cpuSegments = useMemo(() => {
    if (!breakdown) return [];
    const byLabel = new Map(
      breakdown.containers.map((c) => [c.label, c.cpuPercent]),
    );
    return [
      ...LABEL_ORDER.map((label) => ({
        key: label,
        label: SERIES_META[label as keyof typeof SERIES_META].label,
        value: byLabel.get(label) ?? 0,
        color: SERIES_META[label as keyof typeof SERIES_META].color,
      })),
      {
        key: "dockerOverhead",
        label: SERIES_META.dockerOverhead.label,
        value: breakdown.dockerOverheadCpuPercent,
        color: SERIES_META.dockerOverhead.color,
      },
      {
        key: "osOther",
        label: SERIES_META.osOther.label,
        value: breakdown.osOtherCpuPercent,
        color: SERIES_META.osOther.color,
      },
    ];
  }, [breakdown]);

  const memSegments = useMemo(() => {
    if (!breakdown) return [];
    const byLabel = new Map(
      breakdown.containers.map((c) => [c.label, c.memUsedMb]),
    );
    return [
      ...LABEL_ORDER.map((label) => ({
        key: label,
        label: SERIES_META[label as keyof typeof SERIES_META].label,
        value: byLabel.get(label) ?? 0,
        color: SERIES_META[label as keyof typeof SERIES_META].color,
      })),
      {
        key: "dockerOverhead",
        label: SERIES_META.dockerOverhead.label,
        value: breakdown.dockerOverheadMemMb,
        color: SERIES_META.dockerOverhead.color,
      },
      {
        key: "osOther",
        label: SERIES_META.osOther.label,
        value: breakdown.osOtherMemMb,
        color: SERIES_META.osOther.color,
      },
    ];
  }, [breakdown]);

  const diskSegments = useMemo(() => {
    if (!breakdown) return [];
    const byLabel = new Map(
      breakdown.containers.map((c) => [c.label, c.diskUsedMb]),
    );
    return [
      ...LABEL_ORDER.map((label) => ({
        key: label,
        label: SERIES_META[label as keyof typeof SERIES_META].label,
        value: byLabel.get(label) ?? 0,
        color: SERIES_META[label as keyof typeof SERIES_META].color,
      })),
      {
        key: "dockerOverhead",
        label: SERIES_META.dockerOverhead.label,
        value: breakdown.dockerOverheadDiskMb,
        color: SERIES_META.dockerOverhead.color,
      },
      {
        key: "osOther",
        label: SERIES_META.osOther.label,
        value: breakdown.osOtherDiskMb,
        color: SERIES_META.osOther.color,
      },
    ];
  }, [breakdown]);

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
            <div className="relative" ref={deployEventsRef}>
              <button
                type="button"
                onClick={toggleDeployEvents}
                className="flex cursor-pointer items-center gap-1 hover:text-[color:var(--admin-text)]"
              >
                <span>
                  업데이트{" "}
                  {updatedAt.toLocaleTimeString("ko-KR", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3 w-3 shrink-0 transition-transform ${deployEventsOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {deployEventsOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-72 rounded-lg border border-[color:var(--admin-border)] bg-white p-2 text-left shadow-lg">
                  <p className="mb-1.5 px-1 text-[11px] font-semibold text-[color:var(--admin-text)]">
                    최근 배포·재시작 이력
                  </p>
                  {deployEventsLoading ? (
                    <p className="px-1 py-2 text-[11px] text-[color:var(--admin-text-muted)]">
                      불러오는 중...
                    </p>
                  ) : deployEvents.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-[color:var(--admin-text-muted)]">
                      기록된 이력이 없습니다.
                    </p>
                  ) : (
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {deployEvents.map((e, i) => (
                        <li
                          key={i}
                          className="rounded-md px-1.5 py-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[color:var(--admin-text)]">
                              {e.service} · {e.eventType}
                            </span>
                            <span className="shrink-0 text-[color:var(--admin-text-muted)] tabular-nums">
                              {new Date(e.occurredAt).toLocaleString("ko-KR", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                            </span>
                          </div>
                          {e.detail && (
                            <div className="truncate text-[color:var(--admin-text-muted)]">
                              {e.detail}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
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
          {/* 자원 현황 — 서비스별 실행상태 + CPU/메모리(4개 컨테이너+도커 자체+기타)+디스크를 숫자 위주로 보여준다 */}
          {host && (
            <div className="admin-card p-4">
              <p className="mb-3 text-sm font-semibold">자원 현황</p>

              {cards.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {cards.map(({ label, status, stat }) => {
                    const meta =
                      SERIES_META[label as keyof typeof SERIES_META];
                    return (
                      <div
                        key={label}
                        className="flex items-center gap-1.5 rounded-lg border border-[color:var(--admin-border)] px-2.5 py-1.5 text-xs"
                      >
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: meta?.color ?? "#9ca3af" }}
                        />
                        <span className="font-semibold">{label}</span>
                        {status ? (
                          <StateBadge state={status.state} />
                        ) : stat ? (
                          <StateBadge state="running" />
                        ) : null}
                        {status && <HealthDot health={status.health} />}
                        <span className="text-[color:var(--admin-text-muted)]">
                          {status?.status || (stat ? "실행 중" : "—")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-4">
                {breakdown ? (
                  <>
                    <StatGrid
                      title="CPU"
                      segments={cpuSegments}
                      formatSegment={(v) => `${v.toFixed(2)}%`}
                      renderTotal={(sum) => `${sum.toFixed(2)}%`}
                    />
                    <StatGrid
                      title="메모리"
                      segments={memSegments}
                      formatSegment={(v) =>
                        `${Math.round(v)}MB (${((v / breakdown.hostMemTotalMb) * 100).toFixed(1)}%)`
                      }
                      renderTotal={(sum) =>
                        `${Math.round(sum)}MB / ${breakdown.hostMemTotalMb}MB (${((sum / breakdown.hostMemTotalMb) * 100).toFixed(1)}%)`
                      }
                    />
                    <StatGrid
                      title="디스크"
                      segments={diskSegments}
                      formatSegment={(v) =>
                        v >= 1024
                          ? `${(v / 1024).toFixed(2)}GB`
                          : `${Math.round(v)}MB`
                      }
                      renderTotal={(sum) =>
                        `${(sum / 1024).toFixed(2)}GB / ${host.diskTotalGb}GB`
                      }
                    />
                  </>
                ) : (
                  <>
                    <div>
                      <p className="mb-1 text-xs text-[color:var(--admin-text-muted)]">
                        CPU
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {host.cpuPercent.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-[color:var(--admin-text-muted)]">
                        메모리
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {host.memPercent.toFixed(1)}%
                      </p>
                      <p className="text-[11px] text-[color:var(--admin-text-muted)] tabular-nums">
                        {host.memUsedMb}MB / {host.memTotalMb}MB
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-[color:var(--admin-text-muted)]">
                        디스크
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {host.diskPercent}%
                      </p>
                      <p className="text-[11px] text-[color:var(--admin-text-muted)] tabular-nums">
                        {host.diskUsedGb}GB / {host.diskTotalGb}GB
                      </p>
                    </div>
                  </>
                )}
              </div>
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
            {historyTab === "전체" && (
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
                {Object.values(SERIES_META).map((meta) => (
                  <span
                    key={meta.label}
                    className="flex items-center gap-1 text-[11px] text-[color:var(--admin-text-muted)]"
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                    />
                    {meta.label}
                  </span>
                ))}
              </div>
            )}
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
                  ) : historyTab === "전체" ? (
                    breakdownHistory.length === 0 ? (
                      <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                        데이터 없음
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={breakdownHistory}
                          margin={{ top: 5, right: 14, left: 0, bottom: 0 }}
                          onMouseEnter={() => setActiveChart("breakdown-cpu")}
                          onMouseLeave={() => setActiveChart(null)}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="bucket"
                            tick={{ fontSize: 9, fill: "#6b7280" }}
                            {...dateAxis(breakdownHistory, "bucket")}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#6b7280" }}
                            unit="%"
                          />
                          <Tooltip
                            active={activeChart === "breakdown-cpu"}
                            formatter={(v, name) => [`${v ?? 0}%`, name]}
                            wrapperStyle={{ pointerEvents: "none" }}
                          />
                          {CPU_HISTORY_SERIES.map((s) => (
                            <Area
                              key={s.key}
                              type="linear"
                              dataKey={s.key}
                              stackId="cpu"
                              stroke={s.meta.color}
                              fill={s.meta.color}
                              fillOpacity={0.75}
                              name={s.meta.label}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    )
                  ) : containerHistory.length === 0 ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      데이터 없음
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={containerHistory}
                        margin={{ top: 5, right: 14, left: 0, bottom: 0 }}
                        onMouseEnter={() => setActiveChart("container-cpu")}
                        onMouseLeave={() => setActiveChart(null)}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 9, fill: "#6b7280" }}
                          {...dateAxis(containerHistory, "bucket")}
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
                  메모리 {historyTab === "전체" ? "(MB)" : "%"}
                </p>
                <div className="h-32">
                  {historyLoading ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      불러오는 중...
                    </div>
                  ) : historyTab === "전체" ? (
                    breakdownHistory.length === 0 ? (
                      <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                        데이터 없음
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={breakdownHistory}
                          margin={{ top: 5, right: 14, left: 0, bottom: 0 }}
                          onMouseEnter={() => setActiveChart("breakdown-mem")}
                          onMouseLeave={() => setActiveChart(null)}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="bucket"
                            tick={{ fontSize: 9, fill: "#6b7280" }}
                            {...dateAxis(breakdownHistory, "bucket")}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#6b7280" }}
                            unit="MB"
                          />
                          <Tooltip
                            active={activeChart === "breakdown-mem"}
                            formatter={(v, name) => [`${v ?? 0}MB`, name]}
                            wrapperStyle={{ pointerEvents: "none" }}
                          />
                          {MEM_HISTORY_SERIES.map((s) => (
                            <Area
                              key={s.key}
                              type="linear"
                              dataKey={s.key}
                              stackId="mem"
                              stroke={s.meta.color}
                              fill={s.meta.color}
                              fillOpacity={0.75}
                              name={s.meta.label}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    )
                  ) : containerHistory.length === 0 ? (
                    <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                      데이터 없음
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={containerHistory}
                        margin={{ top: 5, right: 14, left: 0, bottom: 0 }}
                        onMouseEnter={() => setActiveChart("container-mem")}
                        onMouseLeave={() => setActiveChart(null)}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 9, fill: "#6b7280" }}
                          {...dateAxis(containerHistory, "bucket")}
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
                    {m.role === "assistant" ? (
                      <div className="relative inline-block max-w-[85%] text-left">
                        <div className="select-text overflow-x-auto rounded-lg bg-slate-100 py-2 pl-3 pr-9 text-sm text-[color:var(--admin-text)]">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyMessage(i, m.content)}
                          aria-label="답변 복사"
                          title="복사"
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-[color:var(--admin-text-muted)] shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
                        >
                          {copiedIndex === i ? (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="inline-block max-w-[85%] select-text whitespace-pre-wrap rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white">
                        {m.content}
                      </span>
                    )}
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--admin-text-muted)]">
                  <svg
                    className="h-3 w-3 shrink-0 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {loadingStage || "답변 생성 중..."}
                </div>
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

          {/* RAG 지식베이스 — 챗봇이 참고하는 과거 운영 기록. 생성은 매주 월요일
              04:00(KST) 크론이 자동으로 한다(RagSnapshotCronService) — 여기선 조회만. */}
          <div className="admin-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">운영 지식베이스 (RAG)</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--admin-text-muted)]">
                매주 월요일 새벽 자동으로 쌓는 운영 스냅샷입니다. 챗봇은 최근 7일치만
                실시간으로 보므로, 그보다 오래된 일은 여기 기록에서 찾아 답합니다.
              </p>
            </div>

            {ragDocs.length === 0 ? (
              <p className="text-sm text-[color:var(--admin-text-muted)]">
                아직 저장된 문서가 없습니다. 다음 월요일 새벽에 첫 스냅샷이 자동 생성됩니다.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ragDocs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 text-[11px] text-[color:var(--admin-text-muted)]">
                      청크 {d.chunk_count}개
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
