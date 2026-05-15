-- youtube_view_snapshots.published_at: DATE → DATETIME
-- 기존 DATE 값은 '2024-01-15' → '2024-01-15 00:00:00' 으로 자동 변환됨
-- 실행: mysql -u [user] -p [dbname] --default-character-set=utf8mb4 < migrate-youtube-published-at.sql

ALTER TABLE youtube_view_snapshots
  MODIFY COLUMN `published_at` DATETIME NOT NULL;
