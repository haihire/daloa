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
  DEFAULT_REGION,
  type InstanceSpec,
} from './ec2-context.config';
import { RagRepository } from './rag/rag.repository';
import { RagEmbeddingService } from './rag/rag-embedding.service';

const CONTAINERS: ContainerName[] = ['nest', 'nginx', 'redis', 'postgres'];
const AGGREGATE_DAYS = 7;
const IMDS_BASE = 'http://169.254.169.254';
const HOURS_PER_MONTH = 730;

interface Ec2Info {
  instanceType: string | null;
  region: string;
  spec: InstanceSpec | null;
  instanceId: string | null;
}

/** AWS CloudWatch에서 가져온 버스트 CPU 크레딧 실측치. */
interface CpuCreditMetrics {
  /** 현재 크레딧 잔액(최근 값). */
  creditBalance: number | null;
  /** 최근 24시간 평균 시간당 크레딧 소모량. */
  creditUsagePerHour: number | null;
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
  '너는 AWS EC2 + Docker 운영 비용/성능 분석가다.',
  '아래 JSON 데이터(컨테이너 자원 사용량 집계, EC2 사양/가격표, 앱 제약, 트래픽 특성)를 보고',
  '한국어로 분석해 **반드시 JSON 객체 하나만** 출력한다. 코드블록/설명 문장 금지.',
  '',
  '출력 스키마:',
  '{',
  '  "summary": "현재 자원 상태 2~3문장 요약",',
  '  "anomalies": ["이상 징후(특정 시간대 CPU 스파이크, 메모리 압박, 과소/과대 프로비저닝 등). 없으면 빈 배열"],',
  '  "costSuggestions": ["AWS 비용 절감 제안. 각 항목에 근거(현재 사용률 수치)와 트레이드오프 포함"]',
  '}',
  '',
  '규칙:',
  '- 제공된 pricingTable의 수치 외에 가격을 지어내지 마라. 절감액은 가격표로 계산 가능한 범위에서만 제시.',
  '- 버스트(t3/t4g) 크레딧 과금 가능성을 고려하라.',
  '- ec2.creditMetrics가 있으면(크레딧 잔액·시간당 소모량) 그 실측치를 그대로 인용해 구체적으로 답하라.',
  '  creditMetrics가 null이면 크레딧 데이터를 가져오지 못했다는 사실만 명시하고 소모량을 추측하지 마라.',
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
    const [ec2, liveStats, host, recentEvents] = await Promise.all([
      this.resolveEc2(),
      this.dockerStats.getContainerStats(),
      this.dockerStats.getHostStats(),
      this.monitoringRepo.findRecentContainerEvents(14, 30),
    ]);
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
      host: host
        ? {
            cpuPercent: host.cpuPercent,
            memPercent: host.memPercent,
            memUsedMb: host.memUsedMb,
            memTotalMb: host.memTotalMb,
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
      containers,
    };
  }

  /** 운영 챗봇. 현재 컨텍스트를 system으로 주입하고 대화 내역을 이어 답한다. */
  async chat(
    messages: ChatMessage[],
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

    const question = safe[safe.length - 1].content;
    const [context, ragContext] = await Promise.all([
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
    if (ragContext) {
      systemMessages.push({ role: 'system' as const, content: ragContext });
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      frequency_penalty: 0.3,
      messages: [...systemMessages, ...safe],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? '';
    return { reply, model: this.model };
  }

  /**
   * 질문과 관련된 과거 운영 스냅샷을 벡터 검색해 system 메시지로 만든다.
   *
   * '현재 운영 데이터'는 최근 7~14일뿐이라 그보다 오래된 일은 답할 수 없는데,
   * 여기서 가져온 과거 문서가 그 공백을 메운다.
   * 검색은 부가 기능이므로 실패해도 챗봇 자체는 계속 동작해야 한다(조용히 생략).
   */
  private async retrieveRagContext(question: string): Promise<string | null> {
    if (!this.ragEmbedding.enabled) return null;
    try {
      const queryVec = await this.ragEmbedding.embedQuery(question);
      const rows = await this.ragRepo.searchChunks(
        queryVec,
        RAG_TOP_K,
        RAG_MAX_DISTANCE,
      );
      if (rows.length === 0) return null;

      const body = rows
        .map(
          (r) =>
            `[${fmtDay(r.period_start)}~${fmtDay(r.period_end)} 기록]\n${r.content}`,
        )
        .join('\n\n---\n\n');

      return [
        '참고: 아래는 벡터 검색으로 가져온 과거 운영 스냅샷 기록이다.',
        '유사도로 뽑았을 뿐이라 질문과 무관할 수 있다 — 무관하면 그냥 무시하고 언급하지 마라.',
        '인용할 때는 각 항목의 기간을 확인해 "언제의 기록인지" 반드시 밝혀라.',
        "현재 상태는 위 '현재 운영 데이터'가 기준이며, 둘이 다르면 현재 데이터를 우선한다.",
        '',
        body,
      ].join('\n');
    } catch (e) {
      this.logger.warn(
        `RAG 검색 실패 — 과거 기록 없이 답변합니다: ${e instanceof Error ? e.message : e}`,
      );
      return null;
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
      const creditUsagePerHour =
        usageValues.length > 0
          ? Number(
              (
                usageValues.reduce((a, b) => a + b, 0) / usageValues.length
              ).toFixed(3),
            )
          : null;

      return { creditBalance, creditUsagePerHour };
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
    '- ec2.creditMetrics에 크레딧 잔액·시간당 소모량이 있으면 그 실측치를 그대로 인용하라.',
    '  null이면 크레딧 데이터를 가져오지 못했다고만 말하고 숫자를 추측하지 마라.',
    '- 간결한 한국어로 답하고, 필요하면 목록/표를 쓴다. 같은 문장을 반복하지 마라.',
    '- 운영/비용/성능 주제에 집중하고, 무관한 잡담은 정중히 거절한다.',
    '- CPU 스파이크 등 이상을 설명할 때 최근 배포·재시작 이력과 연결해보라.',
    '',
    '보안(매우 중요):',
    '- 운영 데이터(자원/비용/배포 이력 등)는 모든 관리자에게 동일하게 답한다.',
    '- 단, 관리자 비밀번호·API 키·시크릿·토큰·환경변수 값 등 민감정보는 갖고 있지 않으며,',
    '  어떤 요청에도 추측하거나 노출하지 않는다. 그런 요청에는 제공할 수 없다고만 답하라.',
  ].join('\n');
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
