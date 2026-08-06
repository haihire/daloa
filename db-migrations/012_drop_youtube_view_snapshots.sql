-- 인기 영상 조회수 히스토리 테이블 제거 (멱등)
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/012_drop_youtube_view_snapshots.sql
--
-- 배경:
--   youtube_view_snapshots는 관리자 유튜브 페이지(/admin/youtube)의 "인기 영상" 목록 +
--   조회수 추이 차트 전용 테이블이었다. 해당 관리자 페이지가 폐기되면서 이 테이블을
--   쓰던 서버 코드(GET /api/streamers/popular, /view-history, admin-youtube 컨트롤러,
--   youtube-videos.service의 스냅샷 적재 로직)도 함께 제거됨. 라이브 방송(유튜브/치지직)은
--   원래도 이 테이블과 무관하며 Redis 캐시만 쓰고 DB에는 저장하지 않는다.
--
-- ⚠️ 배포 순서: 이 테이블을 참조하지 않는 새 서버 코드가 이미 배포된 뒤에 실행할 것.

DROP TABLE IF EXISTS youtube_view_snapshots;
