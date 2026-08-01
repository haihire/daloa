-- 추천 후보(inven_site_candidates)를 도메인 단위로 1행만 유지 (멱등)
-- 기존: url이 UNIQUE → 같은 도메인이 다른 경로(loalogol.kr/ vs loalogol.kr/package)로
--       각각 행이 쌓여 추천 목록에 중복 노출.
-- 변경: domain을 UNIQUE로 → 도메인당 1행. 기존 중복은 병합(언급수 합산, 최단 url 대표).
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/003_candidate_domain_unique.sql

SET search_path TO lost_ark, public;

-- 1) 도메인별 대표 행 선정 + 합산 언급수 계산
--    우선순위: added > rejected > pending → 최단 url → 최소 id
CREATE TEMP TABLE _cand_dedupe AS
SELECT
  id,
  domain,
  ROW_NUMBER() OVER (
    PARTITION BY domain
    ORDER BY
      CASE status WHEN 'added' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
      length(url) ASC,
      id ASC
  ) AS rn,
  SUM(mention_count) OVER (PARTITION BY domain) AS total_mentions
FROM inven_site_candidates;

-- 2) 대표 행에 도메인 합산 언급수 반영
UPDATE inven_site_candidates c
SET mention_count = d.total_mentions
FROM _cand_dedupe d
WHERE c.id = d.id
  AND d.rn = 1
  AND c.mention_count <> d.total_mentions;

-- 3) 비대표(중복) 행 삭제
DELETE FROM inven_site_candidates
WHERE id IN (SELECT id FROM _cand_dedupe WHERE rn > 1);

DROP TABLE _cand_dedupe;

-- 4) url UNIQUE 제약/인덱스 제거 (환경별 이름 차이 대비)
ALTER TABLE inven_site_candidates DROP CONSTRAINT IF EXISTS inven_site_candidates_url_key;
DROP INDEX IF EXISTS inven_site_candidates_url_key;

-- 5) domain UNIQUE 인덱스 추가
CREATE UNIQUE INDEX IF NOT EXISTS inven_site_candidates_domain_key
  ON inven_site_candidates (domain);
