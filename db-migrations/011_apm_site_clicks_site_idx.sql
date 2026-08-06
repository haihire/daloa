-- apm_site_clicks 정규화: site_name/site_href/site_category 스냅샷 컬럼을 없애고,
-- loa_sites.seq를 가리키는 site_idx를 진짜 FK로 둔다.
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/011_apm_site_clicks_site_idx.sql
--
-- ⚠️ 배포 순서 필수: 이 마이그레이션은 컬럼을 지운다. site_name/site_href/site_category를
--    더 이상 참조하지 않는 새 서버 코드(monitoring.repository.ts recordSiteClick/findSiteClicks,
--    sites.repository.ts)가 이미 배포된 뒤에 실행할 것. 구버전 코드가 떠 있는 상태에서 먼저
--    실행하면 INSERT가 없는 컬럼을 참조해 에러난다.
--
-- 배경:
--   apm_site_clicks가 site_href/site_category를 스냅샷으로 저장하고 그걸로 조인·집계했는데,
--   관리자가 사이트 카테고리/이름을 바꾸면 그 시점 전후로 클릭이 갈라져 "클릭 상위" 목록에
--   같은 사이트가 두 줄로 쪼개지는 버그가 있었다(예: 카테고리 변경 후 로펙이 2번 나타남).
--   게다가 이 값들은 이미 loa_sites에 있는 값의 사본이라 정규화 위반이었음.
--
--   site_idx(loa_sites.seq FK)만 남기고, 이름/카테고리/URL은 항상 loa_sites를 조인해
--   최신값을 가져오도록 바꿨다. 사이트가 삭제되면 ON DELETE SET NULL로 site_idx가 NULL이
--   되고, 그 클릭 행은 "어떤 사이트였는지"는 잃지만 개수(전체 클릭 추이 집계)는 그대로 남는다.
--   ("클릭 상위" 랭킹 조회는 INNER JOIN이라 이런 NULL 행은 자연히 빠진다 — 더는 존재하지
--   않는 사이트를 상위 목록에 보여줄 수는 없으므로 의도된 동작.)

BEGIN;

-- 1) site_idx 없으면 추가하고, 기존 행을 site_href로 loa_sites와 매칭해 백필
--    (이미 011을 부분 실행한 적이 있어도 안전하도록 컬럼 존재 여부부터 확인)
ALTER TABLE lost_ark.apm_site_clicks ADD COLUMN IF NOT EXISTS site_idx BIGINT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lost_ark' AND table_name = 'apm_site_clicks' AND column_name = 'site_href'
  ) THEN
    UPDATE lost_ark.apm_site_clicks c
    SET site_idx = s.seq
    FROM lost_ark.loa_sites s
    WHERE c.site_href = s.href
      AND c.site_idx IS NULL;
  END IF;
END $$;

-- 2) 스냅샷 컬럼 제거 (이미 없으면 스킵 — 재실행 안전)
ALTER TABLE lost_ark.apm_site_clicks DROP COLUMN IF EXISTS site_name;
ALTER TABLE lost_ark.apm_site_clicks DROP COLUMN IF EXISTS site_href;
ALTER TABLE lost_ark.apm_site_clicks DROP COLUMN IF EXISTS site_category;

-- 3) site_idx를 진짜 FK로 (재실행 대비 DROP 후 ADD)
ALTER TABLE lost_ark.apm_site_clicks DROP CONSTRAINT IF EXISTS fk_apm_site_clicks_site_idx;
ALTER TABLE lost_ark.apm_site_clicks
  ADD CONSTRAINT fk_apm_site_clicks_site_idx
  FOREIGN KEY (site_idx) REFERENCES lost_ark.loa_sites(seq) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_apm_site_clicks_site_idx ON lost_ark.apm_site_clicks(site_idx);

COMMIT;
