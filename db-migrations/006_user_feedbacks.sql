-- 사용자 익명 피드백(코멘트) 저장 테이블 (멱등)
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/006_user_feedbacks.sql
--
-- 배경: 메인 페이지 사이트 모음 섹션에서 방문자가 익명으로 의견을 남기고,
--       어드민 "사용자 피드백" 페이지에서 조회·삭제한다.
-- 익명 원칙: 작성자 식별 정보(IP·닉네임·이메일)는 저장하지 않는다.
--            스팸 차단은 서버 메모리 레이트리밋으로만 처리(영속 저장 없음).

SET search_path TO lost_ark, public;

CREATE TABLE IF NOT EXISTS user_feedbacks (
  id          BIGSERIAL PRIMARY KEY,
  message     TEXT        NOT NULL,
  path        TEXT        NOT NULL DEFAULT '/',
  device_type TEXT        NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 어드민 목록은 항상 최신순 조회 → created_at DESC 인덱스
CREATE INDEX IF NOT EXISTS user_feedbacks_created_at_idx
  ON user_feedbacks (created_at DESC);
