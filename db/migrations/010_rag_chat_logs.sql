-- 운영 챗봇 Q&A 로그
-- 실행: gh workflow run db-migrate.yml -f sql_file=db/migrations/010_rag_chat_logs.sql
--
-- 배경: 관리자가 챗봇에 어떤 질문을 했고 AI가 뭐라 답했는지 남겨둔다.
--       나중에 RAG/프롬프트 품질을 점검하거나(예: RAG가 실제로 얼마나 쓰이는지),
--       자주 나오는 질문 패턴을 파악하는 데 쓴다. 벡터 컬럼이 없어 Prisma Client로
--       바로 다룰 수 있다(rag_documents/rag_chunks와 달리 raw SQL이 필요 없음).

SET search_path TO lost_ark, public;

CREATE TABLE IF NOT EXISTS rag_chat_logs (
  id              BIGSERIAL PRIMARY KEY,
  question        TEXT        NOT NULL,
  answer          TEXT        NOT NULL,
  model           TEXT        NOT NULL,
  admin_username  TEXT        NOT NULL,
  -- 이 답변에 과거 RAG 스냅샷이 몇 청크나 인용됐는지 — RAG가 실제로 쓰이는지 가늠하는 지표
  rag_chunk_count INT         NOT NULL DEFAULT 0,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 관리자 화면은 항상 최신순 조회
CREATE INDEX IF NOT EXISTS rag_chat_logs_created_at_idx
  ON rag_chat_logs (created_at DESC);
