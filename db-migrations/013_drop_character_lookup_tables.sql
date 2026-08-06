-- 캐릭터/원정대 조회 기능 테이블 제거 (멱등)
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/013_drop_character_lookup_tables.sql
--
-- 배경:
--   loa_users(원정대/캐릭터)·loa_class(직업)·loa_ark_grid(아크그리드) 는 캐릭터 검색·특성
--   빌드 분류 기능 전용 테이블이었다. 해당 기능이 폐기되면서 이 테이블을 쓰던 서버 코드
--   (lostark/, characters/, users/, admin/characters/ 모듈 전체와 app.module.ts의 등록)도
--   함께 제거됨.
--
-- ⚠️ 배포 순서: 이 테이블들을 참조하지 않는 새 서버 코드가 이미 배포된 뒤에 실행할 것.

-- FK 의존 순서: loa_users → loa_ark_grid → loa_class
DROP TABLE IF EXISTS lost_ark.loa_users;
DROP TABLE IF EXISTS lost_ark.loa_ark_grid;
DROP TABLE IF EXISTS lost_ark.loa_class;
