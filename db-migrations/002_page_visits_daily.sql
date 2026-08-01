-- 페이지 방문을 날짜별로 집계하기 위해 apm_page_visits에 visit_day 추가 (멱등)
-- 기존: (path,device,country,os,browser) 조합당 행 1개 + 누적 visits → 재방문 시 last_seen_at만 갱신되어
--       일별 추이가 부정확(과거 방문이 최신일로 몰림).
-- 변경: visit_day(방문 날짜)를 unique 키에 포함 → 날짜별로 행이 나뉘어 일별 방문수 정확.
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/002_page_visits_daily.sql

SET search_path TO lost_ark, public;

-- 1) visit_day 컬럼 추가 (기존 행은 마지막 방문일로 근사)
ALTER TABLE apm_page_visits
  ADD COLUMN IF NOT EXISTS visit_day DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE apm_page_visits
  SET visit_day = last_seen_at::date
  WHERE visit_day <> last_seen_at::date;

-- 2) 날짜 없는 기존 unique 제약/인덱스 제거 (환경별 이름 차이 대비해 모두 시도)
ALTER TABLE apm_page_visits DROP CONSTRAINT IF EXISTS uk_page_device_country_os_browser;
ALTER TABLE apm_page_visits DROP CONSTRAINT IF EXISTS idx_16508_uk_page_device_country_os_browser;
DROP INDEX IF EXISTS uk_page_device_country_os_browser;
DROP INDEX IF EXISTS idx_16508_uk_page_device_country_os_browser;

-- 3) visit_day 포함 unique 인덱스 추가
CREATE UNIQUE INDEX IF NOT EXISTS uk_page_device_country_os_browser_day
  ON apm_page_visits (path, device_type, country_code, os_name, browser_name, visit_day);
