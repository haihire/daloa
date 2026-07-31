import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * RAG 문서/청크 저장소.
 *
 * embedding 컬럼은 pgvector의 vector 타입이라 Prisma Client가 다루지 못한다
 * (schema.prisma에서 Unsupported로 선언). 따라서 이 저장소만 raw SQL을 쓴다.
 * 벡터는 파라미터로 넘긴 뒤 ::vector로 캐스팅 — 문자열 보간이 아니므로 인젝션 안전.
 */

export interface RagSearchRow {
  content: string;
  chunk_index: number;
  title: string;
  source: string;
  period_start: Date;
  period_end: Date;
  distance: number;
}

export interface RagDocumentRow {
  id: bigint;
  title: string;
  source: string;
  period_start: Date;
  period_end: Date;
  created_at: Date;
  chunk_count: bigint;
}

/** number[] → pgvector 리터럴 '[0.1,0.2,...]' */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Date → 'YYYY-MM-DD'.
 * Date를 그대로 넘겨 ::date로 캐스팅하면 DB 세션 타임존에 따라 하루가 밀릴 수 있어,
 * 애플리케이션에서 UTC 기준 날짜 문자열로 확정해 넘긴다.
 */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class RagRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 문서 + 청크를 한 트랜잭션으로 저장한다(중간 실패 시 반쪽 문서가 남지 않도록). */
  async saveDocument(input: {
    title: string;
    source: string;
    periodStart: Date;
    periodEnd: Date;
    contentMd: string;
    chunks: { content: string; embedding: number[] }[];
  }): Promise<bigint> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO rag_documents (title, source, period_start, period_end, content_md)
        VALUES (${input.title}, ${input.source}, ${toDateString(input.periodStart)}::date,
                ${toDateString(input.periodEnd)}::date, ${input.contentMd})
        RETURNING id
      `;
      const documentId = rows[0].id;

      for (const [index, chunk] of input.chunks.entries()) {
        await tx.$executeRaw`
          INSERT INTO rag_chunks (document_id, chunk_index, content, embedding)
          VALUES (${documentId}, ${index}, ${chunk.content},
                  ${toVectorLiteral(chunk.embedding)}::vector)
        `;
      }
      return documentId;
    });
  }

  /**
   * 질문 임베딩과 코사인 거리가 가까운 청크를 찾는다(거리 0에 가까울수록 유사).
   * maxDistance로 관련 없는 청크가 억지로 끼어드는 것을 막는다 —
   * 무관한 문서를 컨텍스트에 넣으면 오히려 답변 품질이 떨어지기 때문.
   */
  async searchChunks(
    queryEmbedding: number[],
    limit: number,
    maxDistance: number,
  ): Promise<RagSearchRow[]> {
    const vec = toVectorLiteral(queryEmbedding);
    return this.prisma.$queryRaw<RagSearchRow[]>`
      SELECT c.content,
             c.chunk_index,
             d.title,
             d.source,
             d.period_start,
             d.period_end,
             (c.embedding <=> ${vec}::vector) AS distance
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE (c.embedding <=> ${vec}::vector) < ${maxDistance}
      ORDER BY distance
      LIMIT ${limit}
    `;
  }

  /** 관리자 화면용 문서 목록(최신순). */
  async listDocuments(limit: number): Promise<RagDocumentRow[]> {
    return this.prisma.$queryRaw<RagDocumentRow[]>`
      SELECT d.id, d.title, d.source, d.period_start, d.period_end, d.created_at,
             COUNT(c.id) AS chunk_count
      FROM rag_documents d
      LEFT JOIN rag_chunks c ON c.document_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC
      LIMIT ${limit}
    `;
  }

  /** 같은 source·기간의 문서가 이미 있는지 (중복 스냅샷 방지). */
  async existsForPeriod(
    source: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM rag_documents
      WHERE source = ${source}
        AND period_start = ${toDateString(periodStart)}::date
        AND period_end = ${toDateString(periodEnd)}::date
    `;
    return Number(rows[0]?.n ?? 0) > 0;
  }
}
