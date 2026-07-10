-- 폐기 기능 잔재 테이블 + 참조되지 않는 고아 enum 정리 (멱등)
-- 실행: gh workflow run db-migrate.yml -f sql_file=db/migrations/005_cleanup_dead_objects.sql
--
-- 배경:
--   1) loa_class_summaries: "AI 직업 한줄평" 기능 폐기(커밋 57c1150에서 Prisma 모델 제거). 테이블만 잔존.
--   2) monitoring_api_probes_cache_type: 대응 테이블(monitoring_api_probes) 부재 → 고아 enum (운영 확인 2026-07-11).
--   3) public.apm_*_device_type: 실제 컬럼은 이미 lost_ark enum을 참조. public 사본은 고아
--      (로컬 한정 — 운영엔 없어서 IF 조건상 자동 skip).

-- 1) 폐기 기능 테이블 제거
DROP TABLE IF EXISTS lost_ark.loa_class_summaries;

-- 2) 고아 enum 제거 — "존재하고 + 어떤 컬럼도 참조하지 않을 때만" DROP (멱등/안전)
DO $$
DECLARE
  fq  text;
  sch text;
  nm  text;
  orphan_types text[] := ARRAY[
    'lost_ark.monitoring_api_probes_cache_type',
    'public.apm_page_visits_device_type',
    'public.apm_site_clicks_device_type',
    'public.apm_youtube_clicks_device_type'
  ];
BEGIN
  FOREACH fq IN ARRAY orphan_types LOOP
    sch := split_part(fq, '.', 1);
    nm  := split_part(fq, '.', 2);
    IF EXISTS (
         SELECT 1 FROM pg_type ty JOIN pg_namespace n ON n.oid = ty.typnamespace
         WHERE n.nspname = sch AND ty.typname = nm AND ty.typtype = 'e'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_attribute a
         JOIN pg_type ty       ON ty.oid = a.atttypid
         JOIN pg_namespace n   ON n.oid = ty.typnamespace
         WHERE n.nspname = sch AND ty.typname = nm
           AND a.attnum > 0 AND NOT a.attisdropped
       )
    THEN
      EXECUTE format('DROP TYPE %I.%I', sch, nm);
      RAISE NOTICE 'dropped orphan enum %', fq;
    ELSE
      RAISE NOTICE 'skip % (absent or still referenced)', fq;
    END IF;
  END LOOP;
END $$;
