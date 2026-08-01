-- 피드백에 작성자의 방문 이력 요약을 덧붙인다 (멱등)
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/007_user_feedbacks_visit_stats.sql
--
-- 배경: 어드민이 피드백을 읽을 때 "뜨내기 의견인지 단골 의견인지" 맥락이 필요하다.
-- 익명 원칙 유지: 방문자 식별자(ID/IP/UA)는 저장하지 않는다. 브라우저가 자기 방문
--   횟수를 세다가 제출 시점에 "숫자"만 함께 보낸다 → 두 피드백이 같은 사람인지는 알 수 없다.
--
-- 주의: 클라이언트가 보내는 값이라 조작 가능하고, 캐시 삭제/기기 변경 시 초기화된다.
--       판단 근거가 아니라 참고용 맥락으로만 쓸 것.
-- visit_days = 0 은 "기록 없음"(이 기능 배포 이전 데이터). 첫 방문은 1부터.

ALTER TABLE lost_ark.user_feedbacks
  ADD COLUMN IF NOT EXISTS visit_days    INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visit_count   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_seen_at DATE;
