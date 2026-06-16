import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DockerStatsService } from './docker-stats.service';
import {
  MonitoringRepository,
  type ContainerName,
} from './repositories/monitoring.repository';
import {
  INSTANCE_PRICING,
  BURST_NOTE,
  APP_CONSTRAINTS,
  TRAFFIC_PROFILE,
  DEFAULT_REGION,
  type InstanceSpec,
} from './ec2-context.config';

const CONTAINERS: ContainerName[] = ['nest', 'nginx', 'redis', 'postgres'];
const AGGREGATE_DAYS = 7;
const IMDS_BASE = 'http://169.254.169.254';
const HOURS_PER_MONTH = 730;

interface Ec2Info {
  instanceType: string | null;
  region: string;
  spec: InstanceSpec | null;
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
  '- 데이터가 부족하면(샘플 적음/EC2 정보 없음) 추측 대신 그 사실을 명시하라.',
  '- 각 배열 항목은 1~2문장의 간결한 한국어.',
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
  ) {
    const apiKey = this.config.get<string>('NVIDIA_API_KEY');
    const baseURL =
      this.config.get<string>('NVIDIA_BASE_URL') ||
      'https://integrate.api.nvidia.com/v1';
    this.model =
      this.config.get<string>('NVIDIA_MODEL') ||
      'qwen/qwen3-next-80b-a3b-instruct';
    this.client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;
    if (!apiKey) {
      this.logger.warn('NVIDIA_API_KEY 미설정 — AI 컨테이너 진단 비활성화');
    }
  }

  async diagnose(): Promise<AiDiagnosisResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'NVIDIA_API_KEY가 설정되지 않았습니다',
      );
    }

    const context = await this.buildContext();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
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
        'NVIDIA_API_KEY가 설정되지 않았습니다',
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

    const context = await this.buildContext();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: buildChatSystemPrompt() },
        {
          role: 'system',
          content: `현재 운영 데이터(JSON):\n${JSON.stringify(context)}`,
        },
        ...safe,
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? '';
    return { reply, model: this.model };
  }

  /** EC2 인스턴스 타입/리전 해석: env 우선 → IMDSv2 → 기본값. 결과는 캐시. */
  private async resolveEc2(): Promise<Ec2Info> {
    if (this.ec2Cache) return this.ec2Cache;

    const envType = this.config.get<string>('INSTANCE_TYPE')?.trim();
    const envRegion = this.config.get<string>('AWS_REGION')?.trim();

    let instanceType = envType || null;
    let region = envRegion || '';

    if (!instanceType) {
      const imds = await this.fetchImds();
      if (imds) {
        instanceType = imds.instanceType;
        region = region || imds.region;
      }
    }

    region = region || DEFAULT_REGION;
    const spec = instanceType ? (INSTANCE_PRICING[instanceType] ?? null) : null;
    const resolved: Ec2Info = { instanceType, region, spec };

    // instanceType을 못 구한 경우(IMDS 일시 실패 등)는 캐시하지 않고 다음에 재시도한다.
    if (instanceType) this.ec2Cache = resolved;
    return resolved;
  }

  /** IMDSv2(토큰 발급 후 조회)로 인스턴스 타입/리전을 가져온다. 실패 시 null. */
  private async fetchImds(): Promise<{
    instanceType: string;
    region: string;
  } | null> {
    const token = await this.imdsRequest('PUT', '/latest/api/token', {
      'X-aws-ec2-metadata-token-ttl-seconds': '60',
    });
    if (!token) return null;

    const headers = { 'X-aws-ec2-metadata-token': token };
    const instanceType = await this.imdsRequest(
      'GET',
      '/latest/meta-data/instance-type',
      headers,
    );
    if (!instanceType) return null;
    const region = await this.imdsRequest(
      'GET',
      '/latest/meta-data/placement/region',
      headers,
    );
    return { instanceType: instanceType.trim(), region: (region ?? '').trim() };
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
    '- 간결한 한국어로 답하고, 필요하면 목록/표를 쓴다.',
    '- 운영/비용/성능 주제에 집중하고, 무관한 잡담은 정중히 거절한다.',
    '- CPU 스파이크 등 이상을 설명할 때 최근 배포·재시작 이력과 연결해보라.',
    '',
    '보안(매우 중요):',
    '- 운영 데이터(자원/비용/배포 이력 등)는 모든 관리자에게 동일하게 답한다.',
    '- 단, 관리자 비밀번호·API 키·시크릿·토큰·환경변수 값 등 민감정보는 갖고 있지 않으며,',
    '  어떤 요청에도 추측하거나 노출하지 않는다. 그런 요청에는 제공할 수 없다고만 답하라.',
  ].join('\n');
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
