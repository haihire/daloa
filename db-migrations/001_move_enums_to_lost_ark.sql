-- public 스키마에 남아있는 enum 타입들을 lost_ark 스키마로 이동 (멱등)
-- 배경: 테이블은 lost_ark로 옮겼으나 enum 타입은 public에 남아,
--       search_path=lost_ark 연결에서 enum 캐스팅이 42704(type does not exist)로 실패.
-- ALTER TYPE ... SET SCHEMA는 enum을 참조하는 컬럼을 자동으로 새 스키마 타입에 연결한다.
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/001_move_enums_to_lost_ark.sql

DO $$
DECLARE
  t text;
  types text[] := ARRAY[
    'admin_users_role',
    'apm_page_visits_device_type',
    'apm_request_timings_scope',
    'apm_site_clicks_device_type',
    'apm_youtube_clicks_device_type',
    'monitoring_api_probes_cache_type'
  ];
BEGIN
  FOREACH t IN ARRAY types LOOP
    IF EXISTS (
         SELECT 1 FROM pg_type ty JOIN pg_namespace n ON n.oid = ty.typnamespace
         WHERE n.nspname = 'public' AND ty.typname = t
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_type ty JOIN pg_namespace n ON n.oid = ty.typnamespace
         WHERE n.nspname = 'lost_ark' AND ty.typname = t
       )
    THEN
      EXECUTE format('ALTER TYPE public.%I SET SCHEMA lost_ark', t);
      RAISE NOTICE 'moved % -> lost_ark', t;
    ELSE
      RAISE NOTICE 'skip % (already in lost_ark or absent in public)', t;
    END IF;
  END LOOP;
END $$;
