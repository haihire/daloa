-- pgvector 확장 + RAG(운영 챗봇 지식베이스) 문서/청크 테이블
-- 실행: gh workflow run db-migrate.yml -f sql_file=db/migrations/009_rag_pgvector.sql
--
-- 배경: 관리자 AI 운영 챗봇은 지금 최근 7~14일 집계만 본다(ai-diagnosis.service.ts
--       AGGREGATE_DAYS/findRecentContainerEvents). 그보다 오래된 이상징후·인시던트를
--       답할 수 있도록, 주기적으로 생성하는 스냅샷 마크다운 문서를 청크 단위로
--       임베딩해두고 유사도 검색으로 챗봇 컨텍스트에 주입한다.
--
-- 문서 정책: append-only 스냅샷(기간 고정, 생성 후 불변). 같은 문서를 계속 덮어써
--           갱신하지 않는다 — LLM 자기수정 누적 드리프트를 피하기 위함.
-- 임베딩 차원: RAG_EMBED_MODEL 1개로 고정(nvidia/nv-embedqa-e5-v5, 1024차원 실측 확인).
--            모델을 바꾸면 컬럼 차원이 달라져 전체 재임베딩이 필요하다.
--            (baai/bge-m3도 1024차원이나 현재 API 키로 호출 시 실패해 채택하지 않음.)

SET search_path TO lost_ark, public;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_documents (
  id           BIGSERIAL PRIMARY KEY,
  title        TEXT        NOT NULL,
  source       TEXT        NOT NULL,        -- 예: 'ops-weekly-summary'
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  content_md   TEXT        NOT NULL,        -- 원본 마크다운 전문(불변)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 챗봇이 "최근 것부터" 훑을 때 쓰는 조회 패턴
CREATE INDEX IF NOT EXISTS rag_documents_source_period_idx
  ON rag_documents (source, period_start DESC);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT       NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_index INT          NOT NULL,
  content     TEXT         NOT NULL,
  embedding   vector(1024) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

-- 지금 규모(수천 row 예상)에서는 인덱스 없이도 순차 스캔으로 충분히 빠르지만,
-- 테이블이 비어있을 때 거는 비용이 0에 가까워 나중에 row가 늘어도 코드 변경 없이
-- 바로 가속되도록 HNSW 인덱스를 미리 걸어둔다.
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);
