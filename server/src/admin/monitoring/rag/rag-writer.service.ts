import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DockerStatsService } from '../docker-stats.service';
import {
  MonitoringRepository,
  type ContainerName,
} from '../monitoring.repository';
import { APP_CONSTRAINTS, TRAFFIC_PROFILE } from '../ec2-context.config';
import { RagRepository } from './rag.repository';
import { RagEmbeddingService } from './rag-embedding.service';
import { kstDateString } from '../../../common/kst-date.util';
import { findSecretLeaks, SECRET_PROMPT_RULES } from './rag-secrets';

/**
 * 운영 지식베이스 문서(주간 스냅샷)를 AI로 작성해 임베딩과 함께 저장한다.
 *
 * 설계 원칙 — append-only:
 *   같은 문서를 AI가 계속 덮어쓰며 갱신하지 않는다. 기간이 고정된 스냅샷을 새로 쌓기만 한다.
 *   덮어쓰기 방식은 LLM 자기수정 드리프트(조금씩 사실이 왜곡되고 원래 근거가 소실됨)가
 *   누적되어, 나중에는 무엇이 실제 관측값이었는지 되짚을 수 없게 된다.
 *
 * 이 문서가 필요한 이유:
 *   챗봇은 최근 7~14일 집계만 본다(AiDiagnosisService). 그보다 오래된 이상징후·인시던트는
 *   답할 수 없는데, 주기적으로 쌓인 이 스냅샷들이 그 장기기억 역할을 한다.
 */

const CONTAINERS: ContainerName[] = ['nest', 'nginx', 'redis', 'postgres'];
const WINDOW_DAYS = 7;
export const RAG_SOURCE_WEEKLY = 'ops-weekly-summary';

/** 청크 크기(문자). 임베딩 모델 입력 한도보다 훨씬 작게 잡아 문단 경계로 자른다. */
const CHUNK_TARGET_CHARS = 700;

@Injectable()
export class RagWriterService {
  private readonly logger = new Logger(RagWriterService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dockerStats: DockerStatsService,
    private readonly monitoringRepo: MonitoringRepository,
    private readonly ragRepo: RagRepository,
    private readonly embedding: RagEmbeddingService,
  ) {
    const apiKey = this.config.get<string>('NVIDIA_API_KEY');
    const baseURL =
      this.config.get<string>('NVIDIA_BASE_URL') ||
      'https://integrate.api.nvidia.com/v1';
    // 문서 작성 모델은 별도 지정 가능. 미지정 시 챗봇과 같은 모델을 쓴다.
    this.model =
      this.config.get<string>('RAG_WRITER_AI_MODEL') ||
      this.config.get<string>('CHATBOT_AI_MODEL') ||
      '';
    this.client =
      apiKey && this.model
        ? new OpenAI({ apiKey, baseURL, timeout: 60000, maxRetries: 1 })
        : null;
    if (!this.client) {
      this.logger.warn(
        'NVIDIA_API_KEY 또는 모델 미설정 — RAG 문서 생성 비활성화',
      );
    }
  }

  /**
   * 최근 WINDOW_DAYS 구간의 운영 스냅샷 문서를 만들어 저장한다.
   * force=false면 같은 기간 문서가 이미 있을 때 건너뛴다(중복 생성 방지).
   */
  async generateWeeklySnapshot(force = false): Promise<{
    created: boolean;
    documentId?: string;
    title: string;
    chunks: number;
    reason?: string;
  }> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI 키 또는 모델이 설정되지 않아 문서를 생성할 수 없습니다',
      );
    }
    if (!this.embedding.enabled) {
      throw new ServiceUnavailableException(
        '임베딩이 비활성화되어 문서를 저장할 수 없습니다',
      );
    }

    const periodEnd = new Date();
    const periodStart = new Date(
      periodEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000,
    );
    const title = `운영 스냅샷 ${fmtDate(periodStart)}~${fmtDate(periodEnd)}`;

    if (
      !force &&
      (await this.ragRepo.existsForPeriod(
        RAG_SOURCE_WEEKLY,
        periodStart,
        periodEnd,
      ))
    ) {
      return {
        created: false,
        title,
        chunks: 0,
        reason: '같은 기간 문서가 이미 존재합니다',
      };
    }

    const context = await this.buildWriterContext();
    const markdown = await this.writeMarkdown(context, title);

    // 2차 방어: 프롬프트 규칙을 어겼거나 컨텍스트가 넓어졌을 경우를 대비한 최종 관문.
    const leaks = findSecretLeaks(markdown);
    if (leaks.length > 0) {
      // 적발된 값 자체는 로그에도 남기지 않는다(로그가 유출 경로가 되지 않도록).
      this.logger.error(
        `RAG 문서에 민감정보로 의심되는 내용이 포함되어 저장을 중단했습니다: ${leaks.join(', ')}`,
      );
      throw new ServiceUnavailableException(
        `민감정보가 감지되어 문서를 저장하지 않았습니다 (${leaks.join(', ')})`,
      );
    }

    // 청크에 기간 헤더를 덧붙이지 않는다 — 모든 청크에 같은 문자열이 붙어 임베딩이
    // 서로 비슷해지기만 하고(실측상 변별력이 오히려 소폭 악화) 이득이 없었다.
    // 검색 결과의 기간은 rag_documents 컬럼에서 가져와 주입 시점에 붙인다.
    const chunks = chunkMarkdown(markdown);
    const embeddings = await this.embedding.embedPassages(chunks);

    const documentId = await this.ragRepo.saveDocument({
      title,
      source: RAG_SOURCE_WEEKLY,
      periodStart,
      periodEnd,
      contentMd: markdown,
      chunks: chunks.map((content, i) => ({
        content,
        embedding: embeddings[i],
      })),
    });

    this.logger.log(`RAG 문서 저장: ${title} (청크 ${chunks.length}개)`);
    return {
      created: true,
      documentId: documentId.toString(),
      title,
      chunks: chunks.length,
    };
  }

  /**
   * 문서 작성 모델에 넘길 컨텍스트 — 1차 방어.
   * 필요한 필드만 화이트리스트로 담는다. 시크릿·계정·IP에 접근하는 경로 자체를 두지 않는다.
   * (AiDiagnosisService.buildContext와 달리 가격표·EC2 식별정보는 넣지 않는다 —
   *  문서는 "그때 무슨 일이 있었나"를 남기는 용도이고, 비용 계산은 진단이 실시간으로 한다.)
   */
  private async buildWriterContext() {
    const [liveStats, host, recentEvents] = await Promise.all([
      this.dockerStats.getContainerStats(),
      this.dockerStats.getHostStats(),
      this.monitoringRepo.findRecentContainerEvents(WINDOW_DAYS, 30),
    ]);
    const liveByLabel = new Map(liveStats.map((s) => [s.label, s]));

    const containers = await Promise.all(
      CONTAINERS.map(async (name) => {
        const [agg, hourly] = await Promise.all([
          this.monitoringRepo.findContainerAggregate(name, WINDOW_DAYS),
          this.monitoringRepo.findContainerHourlyCpu(name, WINDOW_DAYS),
        ]);
        const live = liveByLabel.get(name);
        return {
          label: name,
          role: APP_CONSTRAINTS[name] ?? '',
          nowCpuPercent: live?.cpuPercent ?? null,
          nowMemPercent: live?.memPercent ?? null,
          window: agg
            ? {
                cpuAvg: agg.avg_cpu,
                cpuMax: agg.max_cpu,
                cpuP95: agg.p95_cpu,
                memAvgPct: agg.avg_mem_pct,
                memPeakPct: agg.peak_mem_pct,
                sampleCount: agg.sample_count,
              }
            : null,
          hourlyCpuKst: hourly.map((h) => ({
            hour: h.hour,
            avg: h.avg_cpu,
            max: h.max_cpu,
          })),
        };
      }),
    );

    return {
      windowDays: WINDOW_DAYS,
      timezone: 'Asia/Seoul',
      trafficProfile: TRAFFIC_PROFILE,
      host: host
        ? {
            cpuPercent: host.cpuPercent,
            memPercent: host.memPercent,
            diskPercent: host.diskPercent,
          }
        : null,
      events: recentEvents.map((e) => ({
        service: e.service,
        type: e.event_type,
        detail: e.detail,
        at: e.occurred_at,
      })),
      containers,
    };
  }

  private async writeMarkdown(
    context: unknown,
    title: string,
  ): Promise<string> {
    const systemPrompt = [
      '너는 서비스 운영 기록을 남기는 한국어 테크니컬 라이터다.',
      '주어진 운영 데이터(JSON)를 바탕으로 나중에 다시 찾아볼 수 있는 마크다운 문서를 쓴다.',
      '',
      `제목은 "${title}"이며, 이 문서는 해당 기간의 스냅샷이다.`,
      '나중에 검색됐을 때 "언제 이야기인지" 헷갈리지 않도록 본문에도 기간을 명시하라.',
      '',
      '문서 구성:',
      '## 요약 — 이 기간 운영 상태 3~4문장',
      '## 컨테이너별 사용량 — 표로. 근거 수치(평균·최대·P95)를 그대로 인용',
      '## 이상 징후 — 시간대별 CPU 패턴에서 읽히는 것. 없으면 "특이사항 없음"',
      '## 변경 이력 — 배포·재시작 이벤트와 그 전후 자원 변화',
      '',
      '규칙:',
      '- 제공된 데이터에 있는 수치만 쓴다. 없는 값을 지어내지 마라.',
      '- 원인을 단정하지 말고 데이터로 뒷받침되는 범위에서만 추정하라(추정임을 밝혀라).',
      '- 마크다운 본문만 출력한다. 코드블록으로 감싸지 마라.',
      '',
      SECRET_PROMPT_RULES,
    ].join('\n');

    const completion = await this.client!.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      frequency_penalty: 0.3,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(context) },
      ],
    });

    const text = (completion.choices[0]?.message?.content ?? '').trim();
    // 모델이 지시를 어기고 코드블록으로 감쌌을 때를 대비해 벗겨낸다.
    const unwrapped = text
      .replace(/^```(?:markdown|md)?\s*\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
    if (unwrapped.length < 50) {
      throw new ServiceUnavailableException(
        'AI가 문서를 제대로 생성하지 못했습니다',
      );
    }
    return unwrapped;
  }
}

const fmtDate = kstDateString;

/**
 * 마크다운을 문단 경계로 잘라 청크를 만든다.
 * 문장 중간에서 자르면 임베딩 품질이 떨어지므로 빈 줄(문단) 단위로만 나누고,
 * 한 문단이 목표 크기를 넘으면 그 문단은 그대로 둔다(표가 쪼개지지 않도록).
 */
export function chunkMarkdown(markdown: string): string[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf && buf.length + p.length + 2 > CHUNK_TARGET_CHARS) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
