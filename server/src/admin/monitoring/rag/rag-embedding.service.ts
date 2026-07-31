import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * RAG 임베딩 생성. NVIDIA NIM의 OpenAI 호환 /embeddings 엔드포인트를 쓴다.
 *
 * 모델은 RAG_EMBED_MODEL(기본 nvidia/nv-embedqa-e5-v5, 1024차원)로 고정한다.
 * 이 모델은 비대칭 임베딩이라 저장(passage)과 검색(query)에서 input_type을 다르게
 * 넣어야 검색 품질이 나온다 — 같은 값으로 넣으면 조용히 성능만 떨어진다.
 *
 * 차원은 rag_chunks.embedding vector(1024)와 반드시 일치해야 한다.
 * 모델을 바꾸면 차원이 달라져 전체 재임베딩 + 마이그레이션이 필요하다.
 */

/** db/migrations/009_rag_pgvector.sql 의 vector(1024)와 반드시 같아야 함. */
export const RAG_EMBED_DIM = 1024;

const DEFAULT_EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';
/** 한 번에 보낼 청크 수 — 너무 크면 요청이 거절되므로 나눠 보낸다. */
const BATCH_SIZE = 16;

@Injectable()
export class RagEmbeddingService {
  private readonly logger = new Logger(RagEmbeddingService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('NVIDIA_API_KEY');
    const baseURL =
      this.config.get<string>('NVIDIA_BASE_URL') ||
      'https://integrate.api.nvidia.com/v1';
    this.model =
      this.config.get<string>('RAG_EMBED_MODEL') || DEFAULT_EMBED_MODEL;
    this.client = apiKey
      ? new OpenAI({ apiKey, baseURL, timeout: 45000, maxRetries: 1 })
      : null;
    if (!apiKey) {
      this.logger.warn('NVIDIA_API_KEY 미설정 — RAG 임베딩 비활성화');
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** 저장할 문서 청크용 임베딩. */
  embedPassages(texts: string[]): Promise<number[][]> {
    return this.embed(texts, 'passage');
  }

  /** 검색 질의용 임베딩. */
  async embedQuery(text: string): Promise<number[]> {
    const [vec] = await this.embed([text], 'query');
    return vec;
  }

  private async embed(
    texts: string[],
    inputType: 'passage' | 'query',
  ): Promise<number[][]> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'NVIDIA_API_KEY가 설정되지 않아 임베딩을 만들 수 없습니다',
      );
    }
    if (texts.length === 0) return [];

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      // input_type/truncate는 OpenAI 표준에 없는 NVIDIA 확장 파라미터라
      // SDK 타입에 없다. SDK는 body를 그대로 전송하므로 캐스팅해서 넘긴다.
      const res = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        input_type: inputType,
        truncate: 'END',
      } as unknown as OpenAI.EmbeddingCreateParams);

      // 응답 순서가 요청 순서와 다를 수 있어 index로 정렬한다.
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        const vec = item.embedding as unknown as number[];
        if (vec.length !== RAG_EMBED_DIM) {
          throw new ServiceUnavailableException(
            `임베딩 차원 불일치: ${this.model}이 ${vec.length}차원을 반환했으나 ` +
              `DB 컬럼은 ${RAG_EMBED_DIM}차원입니다. RAG_EMBED_MODEL 설정을 확인하세요.`,
          );
        }
        out.push(vec);
      }
    }
    return out;
  }
}
