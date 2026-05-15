-- Lost Ark DB 초기화 스크립트
-- 실행: mariadb -u root -p lost_ark < scripts/init-db.sql

-- 관리자 계정 테이블
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('master','guest') NOT NULL DEFAULT 'guest',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  combat_power    DECIMAL(10,2),
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

-- youtube 영상 메타데이터 + 일별 조회수 스냅샷 테이블
CREATE TABLE IF NOT EXISTS `youtube_view_snapshots` (
  `id`            BIGINT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `video_id`      VARCHAR(20)         NOT NULL,
  `title`         VARCHAR(500)        NOT NULL DEFAULT '',
  `channel_title` VARCHAR(255)        NOT NULL DEFAULT '',
  `thumbnail_url` VARCHAR(500)        NOT NULL DEFAULT '',
  `published_at`  DATETIME            NOT NULL,
  `duration`      VARCHAR(20)         NOT NULL DEFAULT '',
  `view_count`    INT UNSIGNED        NOT NULL DEFAULT 0,
  `recorded_date` DATE                NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_video_date` (`video_id`, `recorded_date`),
  INDEX `idx_recorded_date` (`recorded_date`),
  INDEX `idx_published_at`  (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;