-- Lost Ark DB 초기화 스크립트
-- 실행: mariadb -u root -p lost_ark < scripts/init-db.sql

CREATE DATABASE IF NOT EXISTS lost_ark
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lost_ark;

-- 직업 분류 테이블 (class_root=직업군, class_detail=직업명, class_engraving=각인명)
CREATE TABLE IF NOT EXISTS loa_class (
  idx             INT AUTO_INCREMENT PRIMARY KEY,
  class_engraving VARCHAR(50)  COLLATE utf8mb4_general_ci,
  class_root      VARCHAR(50)  COLLATE utf8mb4_general_ci,
  gender          VARCHAR(50)  COLLATE utf8mb4_general_ci,
  class_detail    VARCHAR(50)  COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci AUTO_INCREMENT=59;

-- 아크 그리드 코어 테이블
CREATE TABLE IF NOT EXISTS loa_ark_grid (
  seq    INT AUTO_INCREMENT PRIMARY KEY,
  core   VARCHAR(50) COLLATE utf8mb4_general_ci,
  star   VARCHAR(50) COLLATE utf8mb4_general_ci,
  class  INT,
  `order` INT,
  INDEX idx_class (class),
  CONSTRAINT FK_loa_ark_grid_loa_class FOREIGN KEY (class) REFERENCES loa_class (idx)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci AUTO_INCREMENT=523;

-- 원정대 캐릭터 통계
CREATE TABLE IF NOT EXISTS loa_users (
  seq             INT AUTO_INCREMENT PRIMARY KEY,
  server          VARCHAR(50)  COLLATE utf8mb4_general_ci,
  level           FLOAT,
  class           INT,
  thesix          INT,
  name            VARCHAR(50)  COLLATE utf8mb4_general_ci,
  expedition_key  VARCHAR(100) COLLATE utf8mb4_general_ci,
  core_sun        INT,
  core_moon       INT,
  core_star       INT,
  stat_crit       INT NOT NULL DEFAULT 0,
  stat_spec       INT NOT NULL DEFAULT 0,
  stat_swift      INT NOT NULL DEFAULT 0,
  engravings      VARCHAR(200) COLLATE utf8mb4_general_ci,
  gems            VARCHAR(100) COLLATE utf8mb4_general_ci,
  UNIQUE KEY uq_name (name),
  INDEX idx_class (class),
  INDEX idx_core_sun  (core_sun),
  INDEX idx_core_moon (core_moon),
  INDEX idx_core_star (core_star),
  CONSTRAINT fk_users_class FOREIGN KEY (class)     REFERENCES loa_class   (idx) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT core_suns      FOREIGN KEY (core_sun)  REFERENCES loa_ark_grid (seq) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT core_moons     FOREIGN KEY (core_moon) REFERENCES loa_ark_grid (seq) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT core_stars     FOREIGN KEY (core_star) REFERENCES loa_ark_grid (seq) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 사이트 모음 테이블
CREATE TABLE IF NOT EXISTS loa_sites (
  seq         INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL          COLLATE utf8mb4_general_ci,
  href        VARCHAR(500) NOT NULL,
  category    VARCHAR(50)                    COLLATE utf8mb4_general_ci,
  description TEXT                           COLLATE utf8mb4_general_ci,
  icon        VARCHAR(500),
  is_active   TINYINT(1)   DEFAULT 1,
  last_title  VARCHAR(500)                   COLLATE utf8mb4_general_ci,
  last_status INT,
  checked_at  DATETIME,
  UNIQUE KEY uq_href (href)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- AI 직업 한줄평 테이블
CREATE TABLE IF NOT EXISTS loa_class_summaries (
  class_name  VARCHAR(50)  NOT NULL COLLATE utf8mb4_general_ci,
  summary     TEXT         COLLATE utf8mb4_general_ci,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO loa_sites (name, href, category, description, icon) VALUES
('로펙',        'https://lopec.kr/',                  '스펙 수치화', '캐릭터 스펙을 수치화해 보여주는 검색 사이트. 스펙업 효율까지 확인 가능.', 'https://www.google.com/s2/favicons?domain=lopec.kr&sz=32'),
('아이스펭',    'https://loa.icepeng.com/',            '재련·손익 툴', '재련, 상급재련, 돌파고, 더보기 손익 등 각종 툴 제공.', 'https://www.google.com/s2/favicons?domain=loa.icepeng.com&sz=32'),
('로스트 빌드', 'https://lostbuilds.com/',             '데미지 시뮬', '데미지 시뮬레이터 사이트.', 'https://www.google.com/s2/favicons?domain=lostbuilds.com&sz=32'),
('유각 시세 조회','https://loa-shop.pages.dev/',       '시세 조회',   '실시간 유각 시세 조회 사이트.', 'https://www.google.com/s2/favicons?domain=loa-shop.pages.dev&sz=32'),
('LoaGap',      'https://loagap.com/',                '통합 툴',     '컨텐츠 효율, 유각·보석·악세 시세 확인 등 각종 툴 제공.', 'https://www.google.com/s2/favicons?domain=loagap.com&sz=32'),
('로스트 골드', 'https://lostgld.com/',               '생활 효율',   '생활도구 효율 및 융화재료 효율 계산기 지원 사이트.', 'https://www.google.com/s2/favicons?domain=lostgld.com&sz=32'),
('KLoa',        'https://kloa.gg/',                   '공식 통디',   '로스트아크 통디 공식 사이트. 떠상 알람 지원 및 캐릭터 검색 기능 지원.', 'https://www.google.com/s2/favicons?domain=kloa.gg&sz=32'),
('로아와',      'https://loawa.com/',                 '캐릭터 검색', '캐릭터 검색 기능 및 캐릭터 통계 조회 사이트.', 'https://www.google.com/s2/favicons?domain=loawa.com&sz=32'),
('로아베스팅',  'https://www.loavesting.com/',         '재련 계산',   '재련 비용 계산기 등 툴 제공 사이트.', 'https://www.google.com/s2/favicons?domain=loavesting.com&sz=32'),
('Loatto',      'https://loatto.kr/',                 '통합 툴',     '돌파고, 젬파고, 지옥보상 효율 등 각종 툴 제공.', 'https://www.google.com/s2/favicons?domain=loatto.kr&sz=32'),
('로아차트',    'https://loachart.com/',              '제작·경매',   '제작/마리샵/더보기 효율, 레이드 경매 계산기 지원.', 'https://www.google.com/s2/favicons?domain=loachart.com&sz=32'),
('로아업',      'https://loaup.com',                  '스펙업 순서', '스펙업 순서를 가이드해 주는 사이트.', 'https://www.google.com/s2/favicons?domain=loaup.com&sz=32'),
('로아투두',    'https://app.loatodo.com/todo',        '숙제 관리',   '숙제 스케줄 관리 사이트.', 'https://www.google.com/s2/favicons?domain=app.loatodo.com&sz=32'),
('낙원 스킬트리', 'https://sites.google.com/view/achi-loa/%EB%82%99%EC%9B%90/%EB%82%99%EC%9B%90-%EC%8B%9C%EC%A6%8C2', '스킬트리', '각 직업별 낙원 시즌2 스킬트리 모음.', 'https://lh3.googleusercontent.com/sitesv/AA5AbUAZPw15bGLKvLIok7x4BLyrPOgvHJlEsm8_mG52RMhj5m5VWMvaWkyRyYCdrx_K0mbHMqkUYImjq85JtY_Zj5SmppjYdnBFuqkYUYPsksUOgNWm0GJziVt7HEeqkwkFRgBePmTNPj7ABpFrqAXhF_g-Eofk1yjNmwXzrylnmddZ25cj7eX0ApH5gmCdkN_fR0t_1DzMlks5JfPslbOGZg'),
('낙원 장비',    'https://codepen.io/ialgqfxp-the-animator/pen/NPrQxOx',                                             '장비',     '각 직업별 낙원 장비 모음.', 'https://www.google.com/s2/favicons?domain=codepen.io&sz=32');
