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
import AdminDatePicker from "@/components/admin/AdminDatePicker";
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
  hostMemMb: number;
  hostMemTotalMb: number;
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

// 항목별 추세에서 쓸 host_resource_breakdown 컬럼. 한 행 안의 값들이라 모두 같은
// 스케일(호스트 기준)이고, 바로 위에 보이는 현재 수치와도 스케일이 일치한다.
const HISTORY_FIELDS: Record<
  keyof typeof SERIES_META,
  {
    cpu: keyof ResourceBreakdownHistoryPoint;
    mem: keyof ResourceBreakdownHistoryPoint;
  }
> = {
  nest: { cpu: "nestCpu", mem: "nestMemMb" },
  nginx: { cpu: "nginxCpu", mem: "nginxMemMb" },
  redis: { cpu: "redisCpu", mem: "redisMemMb" },
  postgres: { cpu: "postgresCpu", mem: "postgresMemMb" },
  dockerOverhead: { cpu: "dockerOverheadCpu", mem: "dockerOverheadMemMb" },
  osOther: { cpu: "osOtherCpu", mem: "osOtherMemMb" },
};

let containersCache: ContainerStat[] | null = null;
let statusesCache: ContainerStatus[] | null = null;
let hostCache: HostStats | null = null;
let breakdownCache: ResourceBreakdown | null = null;
// 조회 구간(days=1 / days=7 / date=YYYY-MM-DD)별로 따로 캐시한다.
const breakdownHistoryCache: Record<string, ResourceBreakdownHistoryPoint[]> =
  {};

// 자원 추세 조회 구간. 보관기간이 9일이라 날짜 선택도 그 안에서만 의미가 있다.
const TREND_RETENTION_DAYS = 9;

type TrendRange = { days: 1 | 7 } | { from: string; to: string };

function trendQuery(range: TrendRange): string {
  return "days" in range
    ? `days=${range.days}`
    : `from=${range.from}&to=${range.to}`;
}

function trendTitle(range: TrendRange): string {
  if ("days" in range) {
    return range.days === 1 ? "최근 24시간 추세" : "최근 7일 추세";
  }
  return range.from === range.to
    ? `${range.from} 추세`
    : `${range.from} ~ ${range.to} 추세`;
}

/** 버킷 라벨이 KST 기준이라 날짜 선택도 브라우저 시간대가 아닌 KST 날짜로 맞춘다. */
function kstDateStr(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3_600_000 - offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** 항목 하나의 추세 한 점. 메모리는 MB 대신 호스트 대비 %(세로축이 짧아 MB는 잘린다). */
interface TrendPoint {
  bucket: string;
  cpu: number;
  mem: number;
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

/**
 * 자원 현황 상세 패널의 7일 추세 차트. 사이트 관리의 클릭 추이 차트와 같은 형식
 * (부드러운 곡선 + 아래로 옅어지는 그라데이션 채움)이다. 항목 하나당 한 계열만 그리므로
 * "전체"도 적층이 아니라 호스트 총합 한 줄이다 — 구성비는 항목을 눌러서 본다.
 * 데이터는 host_resource_breakdown 한 소스라 바로 위 현재 수치와 스케일이 같다.
 */
function TrendChart({
  data,
  dataKey,
  color,
  name,
  chartId,
  activeChart,
  setActiveChart,
}: {
  data: TrendPoint[];
  dataKey: "cpu" | "mem";
  color: string;
  name: string;
  chartId: string;
  activeChart: string | null;
  setActiveChart: (v: string | null) => void;
}) {
  if (data.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
        데이터 없음
      </div>
    );
  }
  const fillId = `trendFill-${chartId}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
        onMouseEnter={() => setActiveChart(chartId)}
        onMouseLeave={() => setActiveChart(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 9, fill: "#6b7280" }}
          {...dateAxis(data, "bucket")}
        />
        <YAxis width={36} tick={{ fontSize: 10, fill: "#6b7280" }} unit="%" />
        <Tooltip
          active={activeChart === chartId}
          formatter={(v) => [`${v ?? 0}%`, name]}
          wrapperStyle={{ pointerEvents: "none" }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          // 7일치가 다 차면 시간당 168개라 점이 뭉개진다 — 데이터가 적을 때만 점을 찍는다.
          dot={data.length <= 30 ? { r: 3, fill: color } : false}
          name={name}
        />
      </AreaChart>
    </ResponsiveContainer>
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

  const [trendRange, setTrendRange] = useState<TrendRange>({ days: 7 });
  const [breakdownHistory, setBreakdownHistory] = useState<
    ResourceBreakdownHistoryPoint[]
  >(breakdownHistoryCache[trendQuery({ days: 7 })] ?? []);
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

  // 자원 현황 상세 패널의 추세 차트 원본. 한 응답에 6개 항목이 다 들어 있어서
  // 항목을 바꿔도 다시 안 부르고, 조회 구간이 바뀔 때만 부른다.
  useEffect(() => {
    let alive = true;
    const query = trendQuery(trendRange);
    const cached = breakdownHistoryCache[query];
    if (cached) {
      setBreakdownHistory(cached);
    } else {
      setHistoryLoading(true);
      setBreakdownHistory([]);
    }
    async function loadBreakdownHistory() {
      try {
        const res = await fetch(
          `/api/admin/monitoring/resource-breakdown-history?${query}`,
          { cache: "no-store" },
        );
        if (!alive || !res.ok) return;
        const data = (await res.json()) as ResourceBreakdownHistoryPoint[];
        breakdownHistoryCache[query] = data;
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
  }, [trendRange]);

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
  // CPU/메모리/디스크를 각각 따로 6칸씩 늘어놓으면 nest(0.5MB)와 postgres(257MB) 디스크처럼
  // 크기 차이가 큰 항목들이 나란히 있어 비교 자체가 무의미해 보이는 문제가 있었다 —
  // 항목(nest/nginx/redis/postgres/docker/OS) 하나당 세 지표를 다 묶어서, 클릭한 항목
  // 하나만 상세히 보여주는 방식으로 바꾼다.
  const resourceItems = useMemo(() => {
    if (!breakdown) return [];
    const statByLabel = new Map(breakdown.containers.map((c) => [c.label, c]));
    const cardByLabel = new Map(cards.map((c) => [c.label, c]));
    const services = LABEL_ORDER.map((label) => {
      const key = label as keyof typeof SERIES_META;
      const meta = SERIES_META[key];
      const stat = statByLabel.get(label);
      const card = cardByLabel.get(label);
      return {
        key: label,
        label: meta.label,
        color: meta.color,
        cpuPercent: stat?.cpuPercent ?? 0,
        memUsedMb: stat?.memUsedMb ?? 0,
        diskUsedMb: stat?.diskUsedMb ?? 0,
        status: card?.status,
        stat: card?.stat,
        cpuKey: HISTORY_FIELDS[key].cpu as string,
        memKey: HISTORY_FIELDS[key].mem as string,
      };
    });
    return [
      // "전체"는 EC2 호스트 총합 — 추세도 적층이 아니라 호스트 총합 한 줄로 그린다.
      {
        key: "total",
        label: "전체",
        // 6개 카테고리 색과 겹치지 않게 중립(회색) — 계열이 아니라 합계라는 표시.
        color: "#64748b",
        cpuPercent: breakdown.hostCpuPercent,
        memUsedMb: breakdown.hostMemUsedMb,
        diskUsedMb: host ? host.diskUsedGb * 1024 : 0,
        status: undefined,
        stat: undefined,
        cpuKey: "hostCpu",
        memKey: "hostMemMb",
      },
      ...services,
      {
        key: "dockerOverhead",
        label: SERIES_META.dockerOverhead.label,
        color: SERIES_META.dockerOverhead.color,
        cpuPercent: breakdown.dockerOverheadCpuPercent,
        memUsedMb: breakdown.dockerOverheadMemMb,
        diskUsedMb: breakdown.dockerOverheadDiskMb,
        status: undefined,
        stat: undefined,
        cpuKey: HISTORY_FIELDS.dockerOverhead.cpu as string,
        memKey: HISTORY_FIELDS.dockerOverhead.mem as string,
      },
      {
        key: "osOther",
        label: SERIES_META.osOther.label,
        color: SERIES_META.osOther.color,
        cpuPercent: breakdown.osOtherCpuPercent,
        memUsedMb: breakdown.osOtherMemMb,
        diskUsedMb: breakdown.osOtherDiskMb,
        status: undefined,
        stat: undefined,
        cpuKey: HISTORY_FIELDS.osOther.cpu as string,
        memKey: HISTORY_FIELDS.osOther.mem as string,
      },
    ];
  }, [breakdown, cards, host]);

  const [selectedItemKey, setSelectedItemKey] = useState("total");
  const selectedItem =
    resourceItems.find((i) => i.key === selectedItemKey) ?? resourceItems[0];

  // 선택된 항목 하나만 뽑아 차트용으로 변환. 메모리는 MB 대신 호스트 대비 %로 —
  // 세로축 폭이 좁아 "2484MB" 같은 값이 잘리고, CPU와 축 단위도 맞아 읽기 쉽다.
  const trendData = useMemo<TrendPoint[]>(() => {
    if (!selectedItem) return [];
    const { cpuKey, memKey } = selectedItem;
    return breakdownHistory.map((p) => {
      const total = p.hostMemTotalMb || 0;
      const memMb = Number(p[memKey as keyof ResourceBreakdownHistoryPoint] ?? 0);
      return {
        bucket: p.bucket,
        cpu: Number(p[cpuKey as keyof ResourceBreakdownHistoryPoint] ?? 0),
        mem: total > 0 ? Number(((memMb / total) * 100).toFixed(2)) : 0,
      };
    });
  }, [breakdownHistory, selectedItem]);

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
          {/* 자원 현황 — EC2 전체 요약 + 항목(nest/nginx/redis/postgres/docker/OS) 클릭 시 오른쪽에 상세.
              전에는 CPU/메모리/디스크마다 6칸씩 늘어놨는데, nest(0.5MB)와 postgres(257MB) 디스크처럼
              크기 차가 큰 항목들이 나란히 있으면 비교 자체가 무의미해서 하나씩 골라보는 방식으로 바꿨다. */}
          {host && (
            <div className="admin-card p-4">
              <p className="mb-3 text-sm font-semibold">자원 현황</p>

              <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span className="text-[color:var(--admin-text-muted)]">
                  CPU{" "}
                  <span className="font-semibold tabular-nums text-[color:var(--admin-text)]">
                    {host.cpuPercent.toFixed(1)}%
                  </span>
                </span>
                <span className="text-[color:var(--admin-text-muted)]">
                  메모리{" "}
                  <span className="font-semibold tabular-nums text-[color:var(--admin-text)]">
                    {host.memPercent.toFixed(1)}%
                  </span>{" "}
                  <span className="tabular-nums">
                    ({host.memUsedMb}MB/{host.memTotalMb}MB)
                  </span>
                </span>
                <span className="text-[color:var(--admin-text-muted)]">
                  디스크{" "}
                  <span className="font-semibold tabular-nums text-[color:var(--admin-text)]">
                    {host.diskPercent}%
                  </span>{" "}
                  <span className="tabular-nums">
                    ({host.diskUsedGb}GB/{host.diskTotalGb}GB)
                  </span>
                </span>
              </div>

              {breakdown ? (
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <div className="space-y-1">
                    {resourceItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedItemKey(item.key)}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          selectedItemKey === item.key
                            ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: item.color }}
                        />
                        <span className="font-medium text-[color:var(--admin-text)]">
                          {item.label}
                        </span>
                        {item.status && (
                          <span className="ml-auto shrink-0">
                            <HealthDot health={item.status.health} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {selectedItem && (
                    <div className="rounded-lg border border-[color:var(--admin-border)] p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: selectedItem.color }}
                        />
                        <p className="text-sm font-semibold">
                          {selectedItem.label}
                        </p>
                        {selectedItem.status ? (
                          <StateBadge state={selectedItem.status.state} />
                        ) : selectedItem.stat ? (
                          <StateBadge state="running" />
                        ) : null}
                        {selectedItem.status && (
                          <HealthDot health={selectedItem.status.health} />
                        )}
                      </div>
                      {selectedItem.status?.status && (
                        <p className="mb-3 text-[11px] text-[color:var(--admin-text-muted)]">
                          {selectedItem.status.status}
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <div>
                          <p className="text-[11px] text-[color:var(--admin-text-muted)]">
                            CPU
                          </p>
                          <p className="text-sm font-semibold tabular-nums">
                            {selectedItem.cpuPercent.toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[color:var(--admin-text-muted)]">
                            메모리
                          </p>
                          <p className="text-sm font-semibold tabular-nums">
                            {Math.round(selectedItem.memUsedMb)}MB{" "}
                            <span className="text-[11px] font-normal text-[color:var(--admin-text-muted)]">
                              {(
                                (selectedItem.memUsedMb /
                                  breakdown.hostMemTotalMb) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[color:var(--admin-text-muted)]">
                            디스크
                          </p>
                          <p className="text-sm font-semibold tabular-nums">
                            {selectedItem.diskUsedMb >= 1024
                              ? `${(selectedItem.diskUsedMb / 1024).toFixed(2)}GB`
                              : `${Math.round(selectedItem.diskUsedMb)}MB`}
                            {selectedItem.key === "total" && host && (
                              <span className="text-[11px] font-normal text-[color:var(--admin-text-muted)]">
                                {" "}
                                {host.diskPercent}%
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* 같은 항목의 추세 — 지금 수치가 평소 대비 높은지 낮은지 바로 옆에서
                          판단하려고 별도 카드로 빼지 않고 상세 안에 둔다. */}
                      <div className="mt-3 border-t border-[color:var(--admin-border)] pt-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="text-[11px] text-[color:var(--admin-text-muted)]">
                            {trendTitle(trendRange)}
                          </p>
                          {/* 모니터링 "메인페이지 로딩 속도 추이"와 같은 방식 —
                              from~to 두 개의 AdminDatePicker + 오늘 버튼.
                              보관기간이 9일이라 그 이전 날짜는 고를 수 없게 막는다. */}
                          <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs">
                            {([1, 7] as const).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setTrendRange({ days: d })}
                                className={`admin-btn admin-btn-sm shrink-0 whitespace-nowrap ${
                                  "days" in trendRange && trendRange.days === d
                                    ? "admin-btn-primary"
                                    : "admin-btn-secondary"
                                }`}
                              >
                                {d === 1 ? "24시간" : "7일"}
                              </button>
                            ))}
                            <AdminDatePicker
                              value={"days" in trendRange ? "" : trendRange.from}
                              min={kstDateStr(TREND_RETENTION_DAYS - 1)}
                              max={kstDateStr()}
                              onChange={(v) =>
                                setTrendRange((cur) => {
                                  // 시작을 끝보다 뒤로 고르면 끝도 같이 맞춰 순서 유지
                                  const to =
                                    "days" in cur || v > cur.to ? v : cur.to;
                                  return { from: v, to };
                                })
                              }
                            />
                            <span className="text-[color:var(--admin-text-muted)]">
                              ~
                            </span>
                            <AdminDatePicker
                              value={"days" in trendRange ? "" : trendRange.to}
                              min={kstDateStr(TREND_RETENTION_DAYS - 1)}
                              max={kstDateStr()}
                              onChange={(v) =>
                                setTrendRange((cur) => {
                                  // 끝을 시작보다 앞으로 고르면 시작도 같이 맞춰 순서 유지
                                  const from =
                                    "days" in cur || v < cur.from ? v : cur.from;
                                  return { from, to: v };
                                })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const t = kstDateStr();
                                setTrendRange({ from: t, to: t });
                              }}
                              className="admin-btn admin-btn-sm admin-btn-secondary shrink-0 whitespace-nowrap"
                            >
                              오늘
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] text-[color:var(--admin-text-muted)]">
                              CPU %
                            </p>
                            <div className="h-44">
                              {historyLoading ? (
                                <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                                  불러오는 중...
                                </div>
                              ) : (
                                <TrendChart
                                  data={trendData}
                                  dataKey="cpu"
                                  color={selectedItem.color}
                                  name={`${selectedItem.label} CPU`}
                                  chartId={`cpu-${selectedItem.key}`}
                                  activeChart={activeChart}
                                  setActiveChart={setActiveChart}
                                />
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] text-[color:var(--admin-text-muted)]">
                              메모리 %
                            </p>
                            <div className="h-44">
                              {historyLoading ? (
                                <div className="grid h-full place-items-center text-[11px] text-[color:var(--admin-text-muted)]">
                                  불러오는 중...
                                </div>
                              ) : (
                                <TrendChart
                                  data={trendData}
                                  dataKey="mem"
                                  color={selectedItem.color}
                                  name={`${selectedItem.label} 메모리`}
                                  chartId={`mem-${selectedItem.key}`}
                                  activeChart={activeChart}
                                  setActiveChart={setActiveChart}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-[color:var(--admin-text-subtle)]">
                  항목별 상세 데이터 없음 (EC2 도커 환경에서만 표시됩니다)
                </p>
              )}
            </div>
          )}

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
        </div>
      )}
    </div>
  );
}
