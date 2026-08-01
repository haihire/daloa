-- loa_sites.category 정형화: 자유 텍스트 18종 → 고정 9종 + CHECK 제약 (멱등)
-- 실행: gh workflow run db-migrate.yml -f sql_file=db-migrations/008_loa_sites_category_enum.sql
--
-- 배경:
--   사이트 27개에 카테고리가 18종으로 난립. 분류가 아니라 부제목처럼 쓰이고 있었음.
--   중복 예: '시세'/'시세 조회', '재련 계산'/'재련·손익 툴', '도구'/'통합 툴'.
--   원인: 어드민 "사이트 관리"의 category가 자유 텍스트 입력 → 같은 PR에서 select로 교체.
--
--   native enum 대신 CHECK을 쓰는 이유: 001(enum이 public에 남아 42704),
--   005(고아 enum 정리)에서 이미 데인 이력. CHECK은 DROP/ADD 한 번으로 목록 변경이 끝나고
--   Prisma도 계속 String이라 스키마 변경이 없다.
--
--   NULL 정책: 컬럼은 nullable 유지(Prisma `category String?`). CHECK은 NULL을 통과시킨다.
--   현재 NULL인 행은 없음.

BEGIN;

-- 1) 알려진 사이트를 href(unique) 기준으로 새 분류에 매핑
UPDATE lost_ark.loa_sites AS s
SET category = m.new_category
FROM (VALUES
  -- 계산기·툴
  ('https://loatool.taeu.kr/',                                     '계산기·툴'),
  ('https://loagap.com/',                                          '계산기·툴'),
  ('https://lo4.app/',                                             '계산기·툴'),
  ('https://loatto.kr/simulator/gempago',                          '계산기·툴'),
  ('https://www.loavesting.com/',                                  '계산기·툴'),
  ('https://loa.icepeng.com/',                                     '계산기·툴'),
  ('https://lostgld.com/',                                         '계산기·툴'),
  -- 빌드·세팅
  ('https://aloa.gg/ko/arkgrid',                                   '빌드·세팅'),
  ('https://sites.google.com/view/achi-loa/%EB%82%99%EC%9B%90/%EB%82%99%EC%9B%90-%EC%8B%9C%EC%A6%8C2', '빌드·세팅'),
  ('https://codepen.io/ialgqfxp-the-animator/pen/NPrQxOx',         '빌드·세팅'),
  ('https://lostbuilds.com/',                                      '빌드·세팅'),
  ('https://loaup.com',                                            '빌드·세팅'),
  -- 시세·경제
  ('https://loalogol.kr',                                          '시세·경제'),
  ('https://loa-shop.pages.dev/',                                  '시세·경제'),
  ('https://loachart.com/',                                        '시세·경제'),
  -- 공략·정보
  ('https://lobal.kr',                                             '공략·정보'),
  ('https://www.loaroot.com/',                                     '공략·정보'),
  -- 캐릭터·스펙
  ('https://lopec.kr/',                                            '캐릭터·스펙'),
  ('https://loawa.com/',                                           '캐릭터·스펙'),
  -- 전투분석·통계
  ('https://loaviewer.github.io/loa-dps-viewer/',                  '전투분석·통계'),
  ('https://lostark.bible/stats/raids?boss=Corvus+Tul+Rak&difficulty=Nightmare&patch=mar26&filterBy=ilvl&type=dps&minIlvl=1740&maxIlvl=1810', '전투분석·통계'),
  -- 숙제·일정
  ('https://kloa.gg/',                                             '숙제·일정'),
  ('https://app.loatodo.com/todo',                                 '숙제·일정'),
  -- 커뮤니티
  ('https://lostark.inven.co.kr/',                                 '커뮤니티'),
  -- 기타
  ('https://clayloa.com',                                          '기타'),
  ('https://loaraid-discobot.vercel.app',                          '기타'),
  ('https://sasagefind.com/',                                      '기타')
) AS m(href, new_category)
WHERE s.href = m.href
  AND s.category IS DISTINCT FROM m.new_category;

-- 2) 목록 밖 값 방어 — 운영에만 있는 사이트/신규 값이 있어도 CHECK에 걸리지 않게 '기타'로 회수
UPDATE lost_ark.loa_sites
SET category = '기타'
WHERE category IS NOT NULL
  AND category NOT IN (
    '계산기·툴', '빌드·세팅', '시세·경제', '공략·정보', '캐릭터·스펙',
    '전투분석·통계', '숙제·일정', '커뮤니티', '기타'
  );

-- 3) CHECK 제약 — 재실행 대비 DROP 후 ADD
ALTER TABLE lost_ark.loa_sites DROP CONSTRAINT IF EXISTS chk_loa_sites_category;
ALTER TABLE lost_ark.loa_sites
  ADD CONSTRAINT chk_loa_sites_category
  CHECK (category IS NULL OR category IN (
    '계산기·툴', '빌드·세팅', '시세·경제', '공략·정보', '캐릭터·스펙',
    '전투분석·통계', '숙제·일정', '커뮤니티', '기타'
  ));

COMMIT;
