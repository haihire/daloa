import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { DockerStatsService } from './docker-stats.service';
import {
  MonitoringRepository,
  type ContainerName,
} from './monitoring.repository';
import {
  INSTANCE_PRICING,
  BURST_NOTE,
  APP_CONSTRAINTS,
  TRAFFIC_PROFILE,
  SCHEDULED_JOBS_NOTE,
  DEFAULT_REGION,
  type InstanceSpec,
} from './ec2-context.config';
import { RagRepository } from './rag/rag.repository';
import { RagEmbeddingService } from './rag/rag-embedding.service';

const CONTAINERS: ContainerName[] = ['nest', 'nginx', 'redis', 'postgres'];
const AGGREGATE_DAYS = 7;
const IMDS_BASE = 'http://169.254.169.254';
const HOURS_PER_MONTH = 730;
/**
 * 메모리 "압박/위험" 표현을 허용하는 사용률 하한.
 * 예전엔 이 기준이 없어 77%를 "위험"이라 표현하는 등 LLM이 임의로 판단했다.
 * 관리자가 명시한 기준(2026-07-31)을 그대로 코드 상수로 고정한다.
 */
const MEM_CRITICAL_PERCENT = 90;

interface Ec2Info {
  instanceType: string | null;
  region: string;
  spec: InstanceSpec | null;
  instanceId: string | null;
}

/** AWS CloudWatch에서 가져온 버스트 CPU 크레딧 실측치. */
export interface CpuCreditMetrics {
  /** 현재 크레딧 잔액(최근 값). */
  creditBalance: number | null;
  /** 최근 24시간 관측된 잔액 최소/최대 — AWS가 정하는 이론상 상한을 몰라도 "거의 꽉 찼는지"를 판단할 수 있다. */
  creditBalanceMin24h: number | null;
  creditBalanceMax24h: number | null;
  /** 최근 24시간 평균 시간당 크레딧 소모량. */
  creditUsagePerHour: number | null;
  /**
   * 코드가 미리 판정한 상태 — LLM이 두 숫자만 보고 스스로 판단하게 두면
   * "잔액이 상한 근처에서 꽉 차 있는데도 위험하다"고 오판하는 경우가 실측으로 확인됐다
   * (2026-07-31, 잔액 287.57/288 인데도 "크레딧 소진 위험"이라 답함).
   * 판단을 코드에서 결정론적으로 내려 LLM은 인용만 하게 한다.
   */
  balanceStatus: 'near_max' | 'declining' | 'stable' | null;
}

export interface AiDiagnosisResult {
  summary: string;
  anomalies: string[];
  costSuggestions: string[];
  generatedAt: string;
  model: string;
  ec2: { instanceType: string | null; region: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_CHAT_TURNS = 12;
const MAX_CHAT_CHARS = 2000;

/** RAG: 질문당 가져올 과거 스냅샷 청크 수. */
const RAG_TOP_K = 4;
/**
 * 코사인 거리 상한 — '관련성 판별'이 아니라 '쓰레기 차단'용 느슨한 안전선이다.
 *
 * 처음엔 0.55로 조여 무관한 질문을 걸러내려 했으나, 실측해보니 절대 거리로는
 * 관련/무관이 갈리지 않았다(nv-embedqa-e5-v5, 스냅샷 1건 기준):
 *   관련  "postgres 최대 CPU"     0.498
 *   무관  "로스트아크 빌드 추천"    0.602
 *   관련  "배포 언제 했어?"        0.606   ← 무관보다 멀다
 *   무관  "오늘 점심 뭐 먹지?"      0.639
 *   관련  "메모리 사용량 어때?"     0.640   ← 가장 멀다
 * 임베딩 거리는 질문마다 스케일이 달라 질문 간 비교가 성립하지 않기 때문이다.
 * 조인 임계값은 관련 문서를 조용히 누락시키기만 했다.
 *
 * 그래서 판별은 임계값이 아니라 LLM에게 맡기고(주입 프롬프트에서 "무관하면 무시"),
 * 여기서는 top-K로 양을 제한하는 역할만 남긴다.
 */
const RAG_MAX_DISTANCE = 0.75;

const SYSTEM_PROMPT = [
  '너는 이 서비스의 AWS EC2 + Docker 운영 상태를 보고하는 운영 리포터다.',
  '비용 절감 컨설턴트가 아니다 — 평소엔 현재 상태를 담백하게 보고하고,',
  '비용 얘기는 정말 시급한 경우가 아니면 하지 않는다(관리자가 필요하면 채팅으로 따로 물어본다).',
  '아래 JSON 데이터를 보고 한국어로 분석해 **반드시 JSON 객체 하나만** 출력한다. 코드블록/설명 문장 금지.',
  '',
  '출력 스키마:',
  '{',
  '  "summary": "현재 자원·트래픽 상태를 담백하게 보고하는 2~3문장 브리핑",',
  '  "anomalies": ["이번에 특별히 짚어줄 만한 특이사항. \'이상 징후\' 전용이 아니다 — 진짜 이상 신호일',
  '                수도 있고, 배포 이력·크레딧 상태·트래픽 변화처럼 그냥 알아두면 좋은 내용일 수도',
  '                있다. 매번 같은 종류를 기계적으로 채우지 말고, 이번 데이터에서 실제로 눈에 띄는',
  '                것만 그때그때 판단해서 담아라. 특별히 짚을 게 없으면 빈 배열."],',
  '  "costSuggestions": ["정말 시급하고 명확한 절감 기회가 있을 때만. 없으면 빈 배열이 기본값이다."]',
  '}',
  '',
  '규칙:',
  '- anomalies에 항목을 담을지 말지, 뭘 담을지는 매 실행마다 데이터를 보고 새로 판단하라.',
  '  이상 징후·배포 특이사항·크레딧 상태 변화·트래픽 급변 중 이번에 정말 눈에 띄는 것만 골라라.',
  '  "일단 뭐라도 채워야 한다"는 압박으로 사소한 걸 억지로 만들어내지 마라.',
  '- CPU 스파이크 등 패턴을 발견하면 scheduledJobsNote·recentEvents와 먼저 대조해 원인을 밝혀라.',
  '  scheduledJobsNote로 설명되는 시간대면 "이상 징후"가 아니라 "알려진 패턴"이라고 쓰고,',
  '  그 자체를 위험하다고 단정하지 마라. 단순히 "N시에 M%까지 급등했다"고 나열만 하지 마라 —',
  '  왜 그런지, 우려할 일인지 아닌지까지 답하는 게 목적이다.',
  `- host.live.memStatus가 "critical"(사용률 ${MEM_CRITICAL_PERCENT}% 이상)일 때만 메모리 압박/위험을`,
  '  언급하라. 그 미만이면 위험이라 하지 말고 수치만 담백하게 보고하라.',
  '- host.live의 수치는 지금 이 순간 읽은 값이지 기간 평균이 아니다.',
  '  "평균"이라 부르지 말고 "현재"라고 표현하라. 진짜 기간 평균은 containers[].last7d 뿐이다.',
  '- 버스트(t3/t4g) 크레딧 과금 가능성을 고려하되, balanceStatus를 신뢰하라(이미 계산된 판정이다):',
  '  · "near_max" → 크레딧이 상한 근처로 여유가 충분하다. "크레딧 소진 위험" 같은 표현을 쓰지 마라.',
  '  · "declining" → 24시간 동안 뚜렷이 줄고 있다. 이때만 위험 가능성을 언급해도 된다.',
  '  · "stable" → 뚜렷한 증감 없이 유지 중이다. 위험을 단정하지 마라.',
  '  어느 경우든 크레딧을 언급하려면 반드시 실제 수치',
  '  (creditBalance, creditBalanceMin24h~Max24h, creditUsagePerHour)를 인용하라.',
  '  수치를 인용하지 않고 "크레딧 소진 위험이 있다"처럼만 쓰는 것은 금지한다.',
  '  creditMetrics가 null이면 크레딧 데이터를 가져오지 못했다는 사실만 명시하고 소모량을 추측하지 마라.',
  '- traffic이 있으면 방문 추이를 summary에 담백하게 보고하라(예: "최근 7일 방문 N건,',
  '  이전 7일 대비 X% 증가/감소"). costSuggestions는 여기에 엮지 마라.',
  '- 제공된 pricingTable의 수치 외에 가격을 지어내지 마라. 절감액은 가격표로 계산 가능한 범위에서만 제시.',
  '- 데이터가 부족하면(샘플 적음/EC2 정보 없음) 추측 대신 그 사실을 명시하라.',
  '- 각 배열 항목은 1~2문장의 간결한 한국어. 같은 내용을 다른 필드에서 반복하지 마라.',
].join('\n');

@Injectable()
export class AiDiagnosisService {
  private readonly logger = new Logger(AiDiagnosisService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  private ec2Cache: Ec2Info | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dockerStats: DockerStatsService,
    private readonly monitoringRepo: MonitoringRepository,
    private readonly ragRepo: RagRepository,
    private readonly ragEmbedding: RagEmbeddingService,
  ) {
    const apiKey = this.config.get<string>('NVIDIA_API_KEY');
    const baseURL =
      this.config.get<string>('NVIDIA_BASE_URL') ||
      'https://integrate.api.nvidia.com/v1';
    // 사이트 추천(site-suggest)과 모델을 공유하지 않도록 챗봇 전용 env로 분리
    this.model = this.config.get<string>('CHATBOT_AI_MODEL') ?? '';
    // 타임아웃 미설정 시 SDK 기본값이 10분 → 느린 모델이면 무한대기처럼 보인다.
    // 45초로 제한해 느리면 빠르게 실패시킨다.
    this.client =
      apiKey && this.model
        ? new OpenAI({ apiKey, baseURL, timeout: 45000, maxRetries: 1 })
        : null;
    if (!apiKey || !this.model) {
      this.logger.warn(
        'NVIDIA_API_KEY 또는 CHATBOT_AI_MODEL 미설정 — AI 컨테이너 진단 비활성화',
      );
    }
  }

  async diagnose(): Promise<AiDiagnosisResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI 키 또는 모델(CHATBOT_AI_MODEL)이 설정되지 않았습니다',
      );
    }

    const context = await this.buildContext();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      // summary/anomalies/costSuggestions 필드끼리 같은 문장을 되풀이하는 경향이 있어 억제
      frequency_penalty: 0.5,
      // 컨텍스트가 크면 응답도 길어져 기본 한도에서 JSON이 중간에 잘린다(파싱 실패).
      // 한국어는 토큰 소모가 커서 넉넉히 잡는다.
      max_tokens: 2048,
      // 모델이 설명 문장을 덧붙이지 않고 JSON만 내도록 강제 (프롬프트에 "JSON" 명시 필요)
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(context) },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? '';
    const parsed = parseJsonObject(text);
    if (!parsed) {
      this.logger.warn(`AI 진단 응답 파싱 실패: ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException('AI 응답을 해석하지 못했습니다');
    }

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      anomalies: toStringArray(parsed.anomalies),
      costSuggestions: toStringArray(parsed.costSuggestions),
      generatedAt: new Date().toISOString(),
      model: this.model,
      ec2: {
        instanceType: context.ec2.instanceType,
        region: context.ec2.region,
      },
    };
  }

  /** AI에 넘길 컨텍스트(동적 메트릭 + 정적 설정)를 조립한다. */
  private async buildContext() {
    const [ec2, liveStats, host, recentEvents, visitSeries] = await Promise.all(
      [
        this.resolveEc2(),
        this.dockerStats.getContainerStats(),
        this.dockerStats.getHostStats(),
        this.monitoringRepo.findRecentContainerEvents(14, 30),
        this.monitoringRepo.findPageVisitSeriesDays(14),
      ],
    );
    // instanceId가 있어야 조회 가능 — ec2 해석 이후에만 시도
    const creditMetrics = await this.fetchCpuCreditMetrics(
      ec2.instanceId,
      ec2.region,
    );

    const liveByLabel = new Map(liveStats.map((s) => [s.label, s]));

    const containers = await Promise.all(
      CONTAINERS.map(async (name) => {
        const [agg, hourly] = await Promise.all([
          this.monitoringRepo.findContainerAggregate(name, AGGREGATE_DAYS),
          this.monitoringRepo.findContainerHourlyCpu(name, AGGREGATE_DAYS),
        ]);
        const live = liveByLabel.get(name);
        return {
          label: name,
          role: APP_CONSTRAINTS[name] ?? '',
          live: live
            ? {
                cpuPercent: live.cpuPercent,
                memPercent: live.memPercent,
                memUsedMb: live.memUsedMb,
                memTotalMb: live.memTotalMb,
              }
            : null,
          last7d: agg
            ? {
                cpuAvg: agg.avg_cpu,
                cpuMax: agg.max_cpu,
                cpuMin: agg.min_cpu,
                cpuP95: agg.p95_cpu,
                memAvgPct: agg.avg_mem_pct,
                memPeakPct: agg.peak_mem_pct,
                memPeakUsedMb: agg.peak_mem_used_mb,
                sampleCount: agg.sample_count,
              }
            : null,
          // 시간대(KST 0~23시)별 평균/최대 CPU — 스파이크 시간대 탐지용
          hourlyCpuKst: hourly.map((h) => ({
            hour: h.hour,
            avg: h.avg_cpu,
            max: h.max_cpu,
          })),
        };
      }),
    );

    const estMonthly = (usdPerHour: number) =>
      Number((usdPerHour * HOURS_PER_MONTH).toFixed(2));

    return {
      windowDays: AGGREGATE_DAYS,
      timezone: 'Asia/Seoul',
      ec2: {
        instanceType: ec2.instanceType,
        region: ec2.region,
        spec: ec2.spec
          ? {
              vcpu: ec2.spec.vcpu,
              ramGb: ec2.spec.ramGb,
              usdPerHour: ec2.spec.usdPerHour,
              estMonthlyUsd: estMonthly(ec2.spec.usdPerHour),
            }
          : null,
        burstNote: BURST_NOTE,
        creditMetrics,
      },
      pricingTable: Object.entries(INSTANCE_PRICING).map(([type, s]) => ({
        type,
        vcpu: s.vcpu,
        ramGb: s.ramGb,
        usdPerHour: s.usdPerHour,
        estMonthlyUsd: estMonthly(s.usdPerHour),
        note: s.note ?? null,
      })),
      trafficProfile: TRAFFIC_PROFILE,
      // CPU 스파이크 원인 추측 대신 알려진 원인을 먼저 대조하게 하는 근거 데이터
      scheduledJobsNote: SCHEDULED_JOBS_NOTE,
      host: host
        ? {
            // containers[].live 와 같은 이름 규칙 — "지금 이 순간" 값이지 기간 평균이 아님을
            // 필드 구조 자체로 드러낸다. 예전엔 host가 이 구분 없이 밋밋해서 AI가
            // "전체 CPU 평균 4.2%"처럼 순간값을 평균이라 잘못 표현했다(2026-07-31).
            live: {
              cpuPercent: host.cpuPercent,
              memPercent: host.memPercent,
              memUsedMb: host.memUsedMb,
              memTotalMb: host.memTotalMb,
              // "위험/압박" 표현 허용 여부를 LLM 판단이 아니라 코드가 결정 (기준: MEM_CRITICAL_PERCENT)
              memStatus: computeMemStatus(host.memPercent),
            },
            diskPercent: host.diskPercent,
            diskUsedGb: host.diskUsedGb,
            diskTotalGb: host.diskTotalGb,
          }
        : null,
      // 최근 변경(재시작/배포) 이력 — 스파이크 원인 연결용
      recentEvents: recentEvents.map((e) => ({
        service: e.service,
        type: e.event_type,
        detail: e.detail,
        at: e.occurred_at,
      })),
      // 방문 추이(최근 7일 vs 이전 7일) — 자원 얘기만이 아니라 실제 사용량 변화도 보고하기 위함
      traffic: buildTrafficTrend(visitSeries),
      containers,
    };
  }

  /**
   * 운영 챗봇. 현재 컨텍스트를 system으로 주입하고 대화 내역을 이어 답한다.
   * adminUsername은 로그(rag_chat_logs)에 "누가 물었는지" 남기는 용도 — 컨트롤러가
   * 세션에서 뽑아 넘긴다.
   */
  async chat(
    messages: ChatMessage[],
    adminUsername: string,
  ): Promise<{ reply: string; model: string }> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI 키 또는 모델(CHATBOT_AI_MODEL)이 설정되지 않았습니다',
      );
    }

    const safe = (Array.isArray(messages) ? messages : [])
      .filter(
        (m) =>
          (m?.role === 'user' || m?.role === 'assistant') &&
          typeof m?.content === 'string' &&
          m.content.trim().length > 0,
      )
      .slice(-MAX_CHAT_TURNS)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, MAX_CHAT_CHARS),
      }));

    if (safe.length === 0 || safe[safe.length - 1].role !== 'user') {
      throw new BadRequestException('마지막 메시지는 사용자 메시지여야 합니다');
    }

    const startedAt = Date.now();
    const question = safe[safe.length - 1].content;
    const [context, rag] = await Promise.all([
      this.buildContext(),
      this.retrieveRagContext(question),
    ]);

    const systemMessages = [
      { role: 'system' as const, content: buildChatSystemPrompt() },
      {
        role: 'system' as const,
        content: `현재 운영 데이터(JSON):\n${JSON.stringify(context)}`,
      },
    ];
    if (rag.context) {
      systemMessages.push({ role: 'system' as const, content: rag.context });
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      frequency_penalty: 0.3,
      messages: [...systemMessages, ...safe],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? '';

    // Q&A 로그는 부가 기능 — 실패해도 챗봇 응답 자체는 그대로 나가야 한다.
    this.ragRepo
      .logChatExchange({
        question,
        answer: reply,
        model: this.model,
        adminUsername,
        ragChunkCount: rag.chunkCount,
        durationMs: Date.now() - startedAt,
      })
      .catch((e) => {
        this.logger.warn(
          `챗봇 Q&A 로그 저장 실패(응답에는 영향 없음): ${e instanceof Error ? e.message : e}`,
        );
      });

    return { reply, model: this.model };
  }

  /**
   * 질문과 관련된 과거 운영 스냅샷을 벡터 검색해 system 메시지로 만든다.
   *
   * '현재 운영 데이터'는 최근 7~14일뿐이라 그보다 오래된 일은 답할 수 없는데,
   * 여기서 가져온 과거 문서가 그 공백을 메운다.
   * 검색은 부가 기능이므로 실패해도 챗봇 자체는 계속 동작해야 한다(조용히 생략).
   */
  private async retrieveRagContext(
    question: string,
  ): Promise<{ context: string | null; chunkCount: number }> {
    if (!this.ragEmbedding.enabled) return { context: null, chunkCount: 0 };
    try {
      const queryVec = await this.ragEmbedding.embedQuery(question);
      const rows = await this.ragRepo.searchChunks(
        queryVec,
        RAG_TOP_K,
        RAG_MAX_DISTANCE,
      );
      if (rows.length === 0) return { context: null, chunkCount: 0 };

      const body = rows
        .map(
          (r) =>
            `[${fmtDay(r.period_start)}~${fmtDay(r.period_end)} 기록]\n${r.content}`,
        )
        .join('\n\n---\n\n');

      const context = [
        '참고: 아래는 벡터 검색으로 가져온 과거 운영 스냅샷 기록이다.',
        '유사도로 뽑았을 뿐이라 질문과 무관할 수 있다 — 무관하면 그냥 무시하고 언급하지 마라.',
        '인용할 때는 각 항목의 기간을 확인해 "언제의 기록인지" 반드시 밝혀라.',
        "현재 상태는 위 '현재 운영 데이터'가 기준이며, 둘이 다르면 현재 데이터를 우선한다.",
        '',
        body,
      ].join('\n');
      return { context, chunkCount: rows.length };
    } catch (e) {
      this.logger.warn(
        `RAG 검색 실패 — 과거 기록 없이 답변합니다: ${e instanceof Error ? e.message : e}`,
      );
      return { context: null, chunkCount: 0 };
    }
  }

  /** EC2 인스턴스 타입/리전/ID 해석: 타입·리전은 env 우선, ID는 IMDS만 가능. 결과는 캐시. */
  private async resolveEc2(): Promise<Ec2Info> {
    if (this.ec2Cache) return this.ec2Cache;

    const envType = this.config.get<string>('INSTANCE_TYPE')?.trim();
    const envRegion = this.config.get<string>('AWS_REGION')?.trim();

    // instanceId는 env로 대체할 수 없어(크레딧 메트릭 조회용) env 지정 여부와 무관하게 항상 시도.
    // 로컬처럼 IMDS가 없는 환경에서는 1초 타임아웃 후 null로 조용히 넘어간다.
    const imds = await this.fetchImds();

    const instanceType = envType || imds?.instanceType || null;
    let region = envRegion || imds?.region || '';
    const instanceId = imds?.instanceId ?? null;

    region = region || DEFAULT_REGION;
    const spec = instanceType ? (INSTANCE_PRICING[instanceType] ?? null) : null;
    const resolved: Ec2Info = { instanceType, region, spec, instanceId };

    // instanceType을 못 구한 경우(IMDS 일시 실패 등)는 캐시하지 않고 다음에 재시도한다.
    if (instanceType) this.ec2Cache = resolved;
    return resolved;
  }

  /** IMDSv2(토큰 발급 후 조회)로 인스턴스 타입/리전/ID를 가져온다. 실패 시 null. */
  private async fetchImds(): Promise<{
    instanceType: string;
    region: string;
    instanceId: string;
  } | null> {
    const token = await this.imdsRequest('PUT', '/latest/api/token', {
      'X-aws-ec2-metadata-token-ttl-seconds': '60',
    });
    if (!token) return null;

    const headers = { 'X-aws-ec2-metadata-token': token };
    const [instanceType, region, instanceId] = await Promise.all([
      this.imdsRequest('GET', '/latest/meta-data/instance-type', headers),
      this.imdsRequest('GET', '/latest/meta-data/placement/region', headers),
      this.imdsRequest('GET', '/latest/meta-data/instance-id', headers),
    ]);
    if (!instanceType) return null;
    return {
      instanceType: instanceType.trim(),
      region: (region ?? '').trim(),
      instanceId: (instanceId ?? '').trim(),
    };
  }

  /**
   * CloudWatch(AWS/EC2)에서 버스트 CPU 크레딧 잔액/소모량을 가져온다.
   * EC2 인스턴스 프로필(IAM 역할)에 cloudwatch:GetMetricData 권한이 필요하다.
   * 로컬(자격증명 없음)이나 권한 미부여 시에는 에러를 삼키고 null만 반환한다 —
   * SYSTEM_PROMPT가 null을 "데이터 없음"으로 취급하도록 규칙을 두었다.
   */
  private async fetchCpuCreditMetrics(
    instanceId: string | null,
    region: string,
  ): Promise<CpuCreditMetrics | null> {
    if (!instanceId) return null;
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    try {
      const client = new CloudWatchClient({ region });
      const res = await client.send(
        new GetMetricDataCommand({
          StartTime: start,
          EndTime: end,
          MetricDataQueries: [
            {
              Id: 'balance',
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/EC2',
                  MetricName: 'CPUCreditBalance',
                  Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                },
                Period: 300,
                Stat: 'Average',
              },
            },
            {
              Id: 'usage',
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/EC2',
                  MetricName: 'CPUCreditUsage',
                  Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                },
                Period: 3600,
                Stat: 'Sum',
              },
            },
          ],
        }),
      );

      const balanceValues =
        res.MetricDataResults?.find((r) => r.Id === 'balance')?.Values ?? [];
      const usageValues =
        res.MetricDataResults?.find((r) => r.Id === 'usage')?.Values ?? [];

      // GetMetricData는 최신 시각부터 내림차순으로 값을 반환한다.
      const creditBalance = balanceValues[0] ?? null;
      const creditBalanceMin24h =
        balanceValues.length > 0 ? Math.min(...balanceValues) : null;
      const creditBalanceMax24h =
        balanceValues.length > 0 ? Math.max(...balanceValues) : null;
      const creditUsagePerHour =
        usageValues.length > 0
          ? Number(
              (
                usageValues.reduce((a, b) => a + b, 0) / usageValues.length
              ).toFixed(3),
            )
          : null;

      const balanceStatus = computeBalanceStatus(
        creditBalance,
        balanceValues,
        creditBalanceMax24h,
      );

      return {
        creditBalance,
        creditBalanceMin24h,
        creditBalanceMax24h,
        creditUsagePerHour,
        balanceStatus,
      };
    } catch (e) {
      this.logger.warn(
        `CloudWatch CPU 크레딧 조회 실패(자격증명/권한 확인 필요) — 생략: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  private async imdsRequest(
    method: 'GET' | 'PUT',
    path: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(`${IMDS_BASE}${path}`, {
        method,
        headers,
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.text()).trim();
      return body || null;
    } catch {
      // 로컬/IMDS 미가용 환경 — 조용히 무시
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function buildChatSystemPrompt(): string {
  return [
    '너는 이 서비스의 AWS EC2 + Docker 운영을 돕는 한국어 어시스턴트다.',
    "함께 제공되는 '현재 운영 데이터'(JSON: 컨테이너 자원 집계, EC2 사양/가격표,",
    '최근 배포·재시작 이력, 앱 제약, 트래픽 특성)만을 사실 근거로 답한다.',
    '',
    '규칙:',
    '- 데이터에 없는 가격/수치를 지어내지 마라. 모르면 모른다고 말하라.',
    '- creditMetrics.balanceStatus는 이미 계산된 판정이니 그대로 신뢰하라:',
    '  "near_max"=여유 충분(위험 표현 금지), "declining"=이때만 위험 가능성 언급,',
    '  "stable"=위험 단정 금지. 언급할 땐 반드시 실제 수치를 인용하라.',
    '  null이면 크레딧 데이터를 가져오지 못했다고만 말하고 숫자를 추측하지 마라.',
    `- host.live.memStatus가 "critical"(사용률 ${MEM_CRITICAL_PERCENT}% 이상)일 때만 메모리 위험/압박을`,
    '  언급하라. 그 미만이면 위험이라 하지 말고 수치만 담백하게 답하라.',
    '- host.live의 수치는 지금 이 순간 값이다. "평균"이라 하지 말고 "현재"라고 표현하라.',
    '- 간결한 한국어로 답하고, 필요하면 목록/표를 쓴다. 같은 문장을 반복하지 마라.',
    '- 운영/비용/성능 주제에 집중하고, 무관한 잡담은 정중히 거절한다.',
    '- CPU 스파이크 등 패턴을 설명할 때 scheduledJobsNote로 설명되면 그게 원인이라고 답하고,',
    '  아니면 최근 배포·재시작 이력과 연결해보라. 원인 없이 그냥 "위험하다"고만 답하지 마라.',
    '',
    '보안(매우 중요):',
    '- 운영 데이터(자원/비용/배포 이력 등)는 모든 관리자에게 동일하게 답한다.',
    '- 단, 관리자 비밀번호·API 키·시크릿·토큰·환경변수 값 등 민감정보는 갖고 있지 않으며,',
    '  어떤 요청에도 추측하거나 노출하지 않는다. 그런 요청에는 제공할 수 없다고만 답하라.',
  ].join('\n');
}

/**
 * CPU 크레딧 잔액 상태를 결정론적으로 판정한다.
 * AWS가 정한 인스턴스별 이론상 크레딧 상한(t3.micro=288 등)을 하드코딩하지 않는다 —
 * 우리가 관측한 24시간 창의 최대치를 그 인스턴스의 사실상 상한으로 취급한다.
 * (버스트 크레딧은 상한에 도달하면 더 안 쌓이므로, 관측 최대치가 곧 상한에 가깝다)
 */
export function computeBalanceStatus(
  latest: number | null,
  seriesDescByTime: number[],
  observedMax: number | null,
): CpuCreditMetrics['balanceStatus'] {
  if (latest === null || observedMax === null || observedMax <= 0) return null;

  const NEAR_MAX_RATIO = 0.95; // 관측 최대치의 95% 이상이면 "거의 꽉 참"
  const DECLINE_RATIO = 0.15; // 24시간 동안 관측 최대치의 15% 이상 순감소했으면 "감소 추세"

  if (latest >= observedMax * NEAR_MAX_RATIO) return 'near_max';

  // GetMetricData는 최신순(내림차순)이므로 배열 끝이 24시간 전 값이다.
  const oldest = seriesDescByTime[seriesDescByTime.length - 1];
  const netDecline = oldest - latest;
  if (netDecline > observedMax * DECLINE_RATIO) return 'declining';

  return 'stable';
}

/**
 * 메모리 "압박/위험" 표현을 쓸 수 있는지 코드가 결정한다(관리자 지정 기준 90%).
 * LLM에 판단을 맡기면 77% 같은 수치도 "위험"이라 부르는 경우가 실측으로 확인됐다(2026-07-31).
 */
export function computeMemStatus(
  memPercent: number | null,
): 'normal' | 'critical' | null {
  if (memPercent === null) return null;
  return memPercent >= MEM_CRITICAL_PERCENT ? 'critical' : 'normal';
}

/**
 * 최근 7일 vs 이전 7일 방문 수 비교. findPageVisitSeriesDays(14)의 결과(오래된→최신 순,
 * 정확히 14개)를 반으로 잘라 합산한다. 이전 7일 방문이 0이면 %증감은 분모가 0이라
 * 의미가 없으므로 null로 두고(추측 금지 원칙과 동일) 절대 건수만 남긴다.
 */
export function buildTrafficTrend(
  visitSeries: Array<{ bucket: string; count: bigint | number }>,
): {
  last7dVisits: number;
  prior7dVisits: number;
  changePercent: number | null;
} | null {
  if (visitSeries.length !== 14) return null;
  const nums = visitSeries.map((r) => Number(r.count));
  const prior7dVisits = nums.slice(0, 7).reduce((a, b) => a + b, 0);
  const last7dVisits = nums.slice(7, 14).reduce((a, b) => a + b, 0);
  const changePercent =
    prior7dVisits > 0
      ? Number(
          (((last7dVisits - prior7dVisits) / prior7dVisits) * 100).toFixed(1),
        )
      : null;
  return { last7dVisits, prior7dVisits, changePercent };
}

function fmtDay(d: Date | string): string {
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}
