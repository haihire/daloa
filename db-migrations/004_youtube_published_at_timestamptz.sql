-- youtube_view_snapshots.published_at 를 DATE → TIMESTAMPTZ 로 승격 (멱등)
-- 이유: 최근 7일 영상 피드를 DB 누적분에서 서빙하면서 게시 시각 정밀도가 필요해짐.
--       DATE(날짜만)면 같은 날 영상 정렬이 뒤섞이고 timeAgo("N시간 전")가 자정 기준으로 어긋남.
-- 기존 행: 자정(00:00) 시각으로 승격되며, 이후 갱신분부터 전체 시각이 저장됨.
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/004_youtube_published_at_timestamptz.sql

SET search_path TO lost_ark, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'lost_ark'
      AND table_name = 'youtube_view_snapshots'
      AND column_name = 'published_at'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE youtube_view_snapshots
      ALTER COLUMN published_at TYPE timestamptz
      USING published_at::timestamptz;
  END IF;
END $$;
