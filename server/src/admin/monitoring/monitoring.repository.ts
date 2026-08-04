import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';

export interface SummaryRow {
  total_requests: bigint | number;
  error_count: bigint | number | null;
  slow_count: bigint | number | null;
  avg_duration_ms: number | null;
  page_visits: bigint | number;
  mobile_visits: bigint | number;
  desktop_visits: bigint | number;
  tablet_visits: bigint | number;
  bot_visits: bigint | number;
}

export interface VisitRow {
  path: string;
  device_type: DeviceType;
  count: bigint | number;
}

export interface DimensionRow {
  name: string | null;
  count: bigint | number;
}

export type VisitDimension = 'country' | 'os' | 'browser';

export interface DimensionVisitRow extends DimensionRow {
  dim: VisitDimension;
}

export interface SiteClickRow {
  site_name: string;
  site_href: string;
  site_category: string;
  click_count: bigint | number;
}

type RetentionTable = 'apm_request_timings' | 'apm_page_load_timings';

export interface ErrorLogRow {
  id: bigint;
  status_code: number;
  error_name: string;
  method: string;
  path: string;
  message: string | null;
  stack: string | null;
  created_at: Date;
}

export interface PageLoadSeriesRow {
  bucket: string;
  date: string;
  avg_ttfb: number | null;
  avg_dcl: number | null;
  avg_lcp: number | null;
  avg_load: number | null;
  count: bigint | number;
}

export type ContainerName = 'nest' | 'nginx' | 'redis' | 'postgres';

const DOCKER_TABLE: Record<ContainerName, string> = {
  nest: 'docker_metrics_nest',
  nginx: 'docker_metrics_nginx',
  redis: 'docker_metrics_redis',
  postgres: 'docker_metrics_postgres',
};

export interface ContainerHistoryRow {
  bucket: string;
  avg_cpu: number;
  avg_mem: number;
  avg_mem_used_mb: number;
}

export interface ContainerAggregateRow {
  avg_cpu: number;
  max_cpu: number;
  min_cpu: number;
  p95_cpu: number;
  avg_mem_pct: number;
  peak_mem_pct: number;
  peak_mem_used_mb: number;
  sample_count: number;
}

export interface ContainerHourlyCpuRow {
  hour: number;
  avg_cpu: number;
  max_cpu: number;
}

export interface ResourceBreakdownHistoryRow {
  bucket: string;
  avg_nest_cpu: number;
  avg_nest_mem_mb: number;
  avg_nginx_cpu: number;
  avg_nginx_mem_mb: number;
  avg_redis_cpu: number;
  avg_redis_mem_mb: number;
  avg_postgres_cpu: number;
  avg_postgres_mem_mb: number;
  avg_docker_overhead_cpu: number;
  avg_docker_overhead_mem_mb: number;
  avg_os_other_cpu: number;
  avg_os_other_mem_mb: number;
  avg_host_cpu: number;
  avg_host_mem_mb: number;
  avg_host_mem_total_mb: number;
}

@Injectable()
export class MonitoringRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 부팅 시(워커0만, AdminMonitoringService.onModuleInit) `CREATE TABLE IF NOT EXISTS`로
   * 만드는 테이블 — `db-migrations/*.sql`과 달리 `schema.prisma`에는 없다.
   * `CREATE TABLE IF NOT EXISTS`는 기존 테이블의 컬럼 변경은 반영하지 않으므로,
   * 이미 만들어진 뒤 스키마를 바꾸려면 여기가 아니라 `db-migrations/`에 ALTER를 추가할 것
   * (과거 admin_users.role ENUM 불일치로 크래시 루프를 겪은 원인이 이 패턴).
   *
   * 생성 대상:
   *   - ENUM 4종: apm_page_visits_device_type, apm_request_timings_scope,
   *               apm_site_clicks_device_type, apm_youtube_clicks_device_type
   *   - 테이블: apm_page_visits, apm_request_timings, apm_site_clicks, apm_youtube_clicks,
   *             apm_page_load_timings, container_events, error_logs,
   *             docker_metrics_{nest,nginx,redis,postgres}, host_resource_breakdown
   *   - 뷰: apm_page_visit_daily (apm_page_visits 집계, 매 부팅 시 DROP 후 재생성)
   *
   * (참고: admin_users는 별도로 admin-auth.repository.ts 에서 같은 방식으로 부트스트랩된다.)
   */
  async ensureMonitoringTables() {
    await this.prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apm_page_visits_device_type') THEN
          CREATE TYPE apm_page_visits_device_type AS ENUM ('mobile', 'desktop', 'tablet', 'bot', 'unknown');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apm_request_timings_scope') THEN
          CREATE TYPE apm_request_timings_scope AS ENUM ('route', 'section');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apm_site_clicks_device_type') THEN
          CREATE TYPE apm_site_clicks_device_type AS ENUM ('mobile', 'desktop', 'tablet', 'bot', 'unknown');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apm_youtube_clicks_device_type') THEN
          CREATE TYPE apm_youtube_clicks_device_type AS ENUM ('mobile', 'desktop', 'tablet', 'bot', 'unknown');
        END IF;
      END $$;
    `;

    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS apm_page_visits (
        id BIGSERIAL PRIMARY KEY,
        path VARCHAR(255) NOT NULL,
        device_type apm_page_visits_device_type NOT NULL DEFAULT 'unknown',
        user_agent VARCHAR(500) NOT NULL,
        referrer VARCHAR(500),
        country_code VARCHAR(8) NOT NULL DEFAULT 'UNKNOWN',
        os_name VARCHAR(64) NOT NULL DEFAULT 'Unknown',
        browser_name VARCHAR(64) NOT NULL DEFAULT 'Unknown',
        visits INT NOT NULL DEFAULT 1,
        visit_day DATE NOT NULL DEFAULT CURRENT_DATE,
        last_seen_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_page_device_country_os_browser_day UNIQUE (path, device_type, country_code, os_name, browser_name, visit_day)
      )
    `;
    // 일별 방문 추이 뷰: apm_page_visits를 visit_day로 합산해 날짜별 집계를 바로 조회(pgAdmin 등).
    // 별도 저장/동기화 없이 항상 최신. SELECT * FROM apm_page_visit_daily;
    // 컬럼 구성이 바뀌어도 startup이 깨지지 않도록 DROP 후 재생성
    // (CREATE OR REPLACE VIEW는 컬럼 추가/삭제/순서변경 시 에러로 기동 실패할 수 있음).
    await this.prisma.$executeRaw`DROP VIEW IF EXISTS apm_page_visit_daily`;
    await this.prisma.$executeRaw`
      CREATE VIEW apm_page_visit_daily AS
      SELECT visit_day,
             SUM(visits)                                        AS total,
             SUM(visits) FILTER (WHERE device_type = 'desktop') AS desktop,
             SUM(visits) FILTER (WHERE device_type = 'mobile')  AS mobile,
             SUM(visits) FILTER (WHERE device_type = 'tablet')  AS tablet,
             SUM(visits) FILTER (WHERE device_type = 'bot')     AS bot,
             COUNT(*)                                           AS rows
      FROM apm_page_visits
      GROUP BY visit_day
      ORDER BY visit_day DESC
    `;
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS apm_request_timings (
        id BIGSERIAL PRIMARY KEY,
        scope apm_request_timings_scope NOT NULL,
        name VARCHAR(100) NOT NULL,
        path VARCHAR(255),
        method VARCHAR(10),
        status_code INT,
        duration_ms INT NOT NULL,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS apm_site_clicks (
        id BIGSERIAL PRIMARY KEY,
        site_name VARCHAR(255) NOT NULL,
        site_href VARCHAR(500) NOT NULL,
        site_category VARCHAR(100) NOT NULL DEFAULT 'unknown',
        device_type apm_site_clicks_device_type NOT NULL DEFAULT 'unknown',
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS apm_youtube_clicks (
        id BIGSERIAL PRIMARY KEY,
        video_id VARCHAR(100) NOT NULL,
        video_title VARCHAR(500) NOT NULL DEFAULT '',
        channel_title VARCHAR(255) NOT NULL DEFAULT '',
        device_type apm_youtube_clicks_device_type NOT NULL DEFAULT 'unknown',
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    // 페이지 로딩 속도(실사용자 RUM). source 컬럼은 과거 데이터 호환을 위해 유지. 지표는 NULL 허용.
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS apm_page_load_timings (
        id BIGSERIAL PRIMARY KEY,
        source VARCHAR(16) NOT NULL DEFAULT 'rum',
        path VARCHAR(255) NOT NULL DEFAULT '/',
        device_type VARCHAR(16) NOT NULL DEFAULT 'unknown',
        ttfb_ms INT,
        dcl_ms INT,
        lcp_ms INT,
        load_ms INT,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_request_timings_created_at ON apm_request_timings(created_at)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_request_timings_scope_name ON apm_request_timings(scope, name)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_site_clicks_created_at ON apm_site_clicks(created_at)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_site_clicks_site_href ON apm_site_clicks(site_href)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_youtube_clicks_created_at ON apm_youtube_clicks(created_at)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_youtube_clicks_video_id ON apm_youtube_clicks(video_id)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_page_load_timings_created_at ON apm_page_load_timings(created_at)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_apm_page_load_timings_source_created_at ON apm_page_load_timings(source, created_at)`;

    // 서비스 변경(재시작/배포) 이벤트 로그. occurred_at=실제 발생시각, detected_at=감지시각.
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS container_events (
        id BIGSERIAL PRIMARY KEY,
        service VARCHAR(16) NOT NULL,
        event_type VARCHAR(24) NOT NULL,
        detail VARCHAR(500),
        occurred_at TIMESTAMPTZ(6) NOT NULL,
        detected_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_container_events_service_occurred_at ON container_events(service, occurred_at)`;

    // 애플리케이션 에러 로그. 전역 예외 필터(AllExceptionsFilter)가 401/404를 뺀 모든 에러를 기록.
    // 파일 로그/Sentry와 별개로, 관리자 UI에서 상태코드·기간으로 조회하기 쉽게 DB에 남긴다.
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS error_logs (
        id BIGSERIAL PRIMARY KEY,
        status_code SMALLINT NOT NULL,
        error_name VARCHAR(80) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(512) NOT NULL,
        message TEXT,
        stack TEXT,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC)`;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_error_logs_status_created_at ON error_logs(status_code, created_at DESC)`;

    for (const container of Object.keys(DOCKER_TABLE) as ContainerName[]) {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS docker_metrics_${container} (
          id BIGSERIAL PRIMARY KEY,
          cpu_percent DECIMAL(5,2) NOT NULL,
          mem_used_mb INT NOT NULL,
          mem_total_mb INT NOT NULL,
          mem_percent DECIMAL(5,2) NOT NULL,
          created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_docker_${container}_created_at
        ON docker_metrics_${container}(created_at)
      `);
    }

    // 호스트 전체 자원의 매 5분 스냅샷: 4개 컨테이너(코어수로 정규화한 CPU%, 호스트 스케일)
    // + 도커 데몬 자체(dockerd/containerd 등) + 그 나머지(OS/커널/기타 프로세스) + 호스트 총합.
    // 한 행 안의 모든 값이 같은 순간·같은 스케일이라 "전체" 적층(stacked) 추세 하나로 바로 그릴 수 있다.
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS host_resource_breakdown (
        id BIGSERIAL PRIMARY KEY,
        nest_cpu_percent DECIMAL(5,2) NOT NULL,
        nest_mem_used_mb INT NOT NULL,
        nginx_cpu_percent DECIMAL(5,2) NOT NULL,
        nginx_mem_used_mb INT NOT NULL,
        redis_cpu_percent DECIMAL(5,2) NOT NULL,
        redis_mem_used_mb INT NOT NULL,
        postgres_cpu_percent DECIMAL(5,2) NOT NULL,
        postgres_mem_used_mb INT NOT NULL,
        docker_overhead_cpu_percent DECIMAL(5,2) NOT NULL,
        docker_overhead_mem_mb INT NOT NULL,
        os_other_cpu_percent DECIMAL(5,2) NOT NULL,
        os_other_mem_mb INT NOT NULL,
        host_cpu_percent DECIMAL(5,2) NOT NULL,
        host_mem_used_mb INT NOT NULL,
        host_mem_total_mb INT NOT NULL,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.prisma
      .$executeRaw`CREATE INDEX IF NOT EXISTS idx_host_resource_breakdown_created_at ON host_resource_breakdown(created_at)`;
  }

  async recordRequest(input: {
    scope: 'route' | 'section';
    name: string;
    path?: string;
    method?: string;
    statusCode?: number;
    durationMs: number;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO apm_request_timings
        (scope, name, path, method, status_code, duration_ms, created_at)
      VALUES (
        ${input.scope}::apm_request_timings_scope,
        ${input.name},
        ${input.path ?? null},
        ${input.method ?? null},
        ${input.statusCode ?? null},
        ${Math.max(0, Math.round(input.durationMs))},
        NOW()
      )
    `;
  }

  async recordPageVisit(input: {
    path: string;
    deviceType: DeviceType;
    userAgent: string;
    referrer: string | null;
    countryCode: string;
    osName: string;
    browserName: string;
  }) {
    // visit_day(방문 날짜)를 충돌 키에 포함 → 같은 방문자라도 날짜별로 행이 나뉘어
    // 일별 방문 추이가 정확해진다 (5/1·5/3 따로 집계).
    await this.prisma.$executeRaw`
      INSERT INTO apm_page_visits
        (path, device_type, user_agent, referrer, country_code, os_name, browser_name, visit_day, created_at)
      VALUES (
        ${input.path},
        ${input.deviceType}::apm_page_visits_device_type,
        ${input.userAgent},
        ${input.referrer},
        ${input.countryCode},
        ${input.osName},
        ${input.browserName},
        (NOW() AT TIME ZONE 'Asia/Seoul')::date,
        NOW()
      )
      ON CONFLICT (path, device_type, country_code, os_name, browser_name, visit_day)
      DO UPDATE SET
        visits = apm_page_visits.visits + 1,
        user_agent = EXCLUDED.user_agent,
        referrer = EXCLUDED.referrer,
        last_seen_at = NOW()
    `;
  }

  async recordSiteClick(input: {
    siteName: string;
    siteHref: string;
    siteCategory: string;
    deviceType: DeviceType;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO apm_site_clicks
        (site_name, site_href, site_category, device_type, created_at)
      VALUES (
        ${input.siteName},
        ${input.siteHref},
        ${input.siteCategory},
        ${input.deviceType}::apm_site_clicks_device_type,
        NOW()
      )
    `;
  }

  async recordYoutubeClick(input: {
    videoId: string;
    videoTitle: string;
    channelTitle: string;
    deviceType: DeviceType;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO apm_youtube_clicks
        (video_id, video_title, channel_title, device_type, created_at)
      VALUES (
        ${input.videoId},
        ${input.videoTitle},
        ${input.channelTitle},
        ${input.deviceType}::apm_youtube_clicks_device_type,
        NOW()
      )
    `;
  }

  /** 페이지 로딩 측정값 1건 저장(실사용자 RUM). 지표는 NULL 허용. */
  async recordPageLoad(input: {
    path: string;
    deviceType: string;
    ttfbMs: number | null;
    dclMs: number | null;
    lcpMs: number | null;
    loadMs: number | null;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO apm_page_load_timings
        (source, path, device_type, ttfb_ms, dcl_ms, lcp_ms, load_ms, created_at)
      VALUES (
        'rum',
        ${input.path},
        ${input.deviceType},
        ${input.ttfbMs},
        ${input.dclMs},
        ${input.lcpMs},
        ${input.loadMs},
        NOW()
      )
    `;
  }

  /** 시간버킷 평균(ttfb/dcl/lcp/load). 빈 버킷도 채워 반환. */
  /**
   * 페이지 로딩 추이. from===to면 그날 시간별(00~23시 24칸), 아니면 from~to 일별.
   * 버킷/라벨은 한국시간(KST) 달력 기준. 빈 버킷도 generate_series로 채운다.
   * 이미 지난 버킷(현재시각 이하)은 데이터가 없어도 0으로 채워 점을 찍고,
   * 아직 안 온 미래 버킷은 NULL로 둬서 점을 안 찍는다.
   *
   * 경계는 반드시 `${x}::timestamp AT TIME ZONE 'Asia/Seoul'`로 쓴다.
   * `::date AT TIME ZONE`는 date→timestamptz 암묵 캐스팅이 끼어 경계가 어긋나
   * (세션 TZ에 따라 timestamp-without-tz가 반환됨) 프로덕션에서 오늘 데이터가
   * 통째로 필터에서 빠지는 버그가 있었다.
   */
  async findPageLoadSeries(from: string, to: string) {
    if (from === to) {
      // 선택한 하루 시간별 (KST 00:00~23:00 24칸 고정)
      return this.prisma.$queryRaw<PageLoadSeriesRow[]>`
        WITH samples AS (
          SELECT date_trunc('hour', created_at AT TIME ZONE 'Asia/Seoul') AS bucket_start,
                 ttfb_ms, dcl_ms, lcp_ms, load_ms
          FROM apm_page_load_timings
          WHERE source = 'rum'
            AND created_at >= (${from}::timestamp) AT TIME ZONE 'Asia/Seoul'
            AND created_at <  (${from}::timestamp + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul'
        ),
        buckets AS (
          SELECT generate_series(
                   ${from}::timestamp,
                   ${from}::timestamp + INTERVAL '23 hours',
                   INTERVAL '1 hour'
                 ) AS bucket_start
        )
        SELECT TO_CHAR(b.bucket_start, 'HH24:MI') AS bucket,
               TO_CHAR(b.bucket_start::date, 'YYYY-MM-DD') AS date,
               CASE WHEN b.bucket_start <= date_trunc('hour', NOW() AT TIME ZONE 'Asia/Seoul')
                    THEN COALESCE(ROUND(AVG(s.ttfb_ms))::int, 0) END AS avg_ttfb,
               CASE WHEN b.bucket_start <= date_trunc('hour', NOW() AT TIME ZONE 'Asia/Seoul')
                    THEN COALESCE(ROUND(AVG(s.dcl_ms))::int, 0) END AS avg_dcl,
               CASE WHEN b.bucket_start <= date_trunc('hour', NOW() AT TIME ZONE 'Asia/Seoul')
                    THEN COALESCE(ROUND(AVG(s.lcp_ms))::int, 0) END AS avg_lcp,
               CASE WHEN b.bucket_start <= date_trunc('hour', NOW() AT TIME ZONE 'Asia/Seoul')
                    THEN COALESCE(ROUND(AVG(s.load_ms))::int, 0) END AS avg_load,
               COUNT(s.bucket_start) AS count
        FROM buckets b
        LEFT JOIN samples s ON s.bucket_start = b.bucket_start
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start ASC
      `;
    }

    // from~to 일별 (KST 달력)
    return this.prisma.$queryRaw<PageLoadSeriesRow[]>`
      WITH samples AS (
        SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS bucket_start,
               ttfb_ms, dcl_ms, lcp_ms, load_ms
        FROM apm_page_load_timings
        WHERE source = 'rum'
          AND created_at >= (${from}::timestamp) AT TIME ZONE 'Asia/Seoul'
          AND created_at <  (${to}::timestamp + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul'
      ),
      buckets AS (
        SELECT g::date AS bucket_start
        FROM generate_series(${from}::date, ${to}::date, INTERVAL '1 day') AS g
      )
      SELECT TO_CHAR(b.bucket_start, 'MM-DD') AS bucket,
             TO_CHAR(b.bucket_start, 'YYYY-MM-DD') AS date,
             CASE WHEN b.bucket_start <= (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  THEN COALESCE(ROUND(AVG(s.ttfb_ms))::int, 0) END AS avg_ttfb,
             CASE WHEN b.bucket_start <= (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  THEN COALESCE(ROUND(AVG(s.dcl_ms))::int, 0) END AS avg_dcl,
             CASE WHEN b.bucket_start <= (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  THEN COALESCE(ROUND(AVG(s.lcp_ms))::int, 0) END AS avg_lcp,
             CASE WHEN b.bucket_start <= (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  THEN COALESCE(ROUND(AVG(s.load_ms))::int, 0) END AS avg_load,
             COUNT(s.bucket_start) AS count
      FROM buckets b
      LEFT JOIN samples s ON s.bucket_start = b.bucket_start
      GROUP BY b.bucket_start
      ORDER BY b.bucket_start ASC
    `;
  }

  /** RUM 페이지 로딩 데이터가 처음 생긴 날짜(KST, YYYY-MM-DD). 없으면 null. */
  async findEarliestPageLoadDate(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ earliest: string | null }>
    >`
      SELECT TO_CHAR(
               MIN((created_at AT TIME ZONE 'Asia/Seoul')::date),
               'YYYY-MM-DD'
             ) AS earliest
      FROM apm_page_load_timings
      WHERE source = 'rum'
    `;
    return rows[0]?.earliest ?? null;
  }

  async findSummary(slowThresholdMs: number) {
    const rows = await this.prisma.$queryRaw<SummaryRow[]>`
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN duration_ms >= ${slowThresholdMs} THEN 1 ELSE 0 END) AS slow_count,
        ROUND(AVG(duration_ms))::int AS avg_duration_ms,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits) AS page_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'mobile') AS mobile_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'desktop') AS desktop_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'tablet') AS tablet_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'bot') AS bot_visits
      FROM apm_request_timings
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `;
    return rows[0];
  }

  async findPageVisitSeriesDays(days: number) {
    // 일별 방문 추이: 날짜축(generate_series)에 apm_page_visits를 직접 LEFT JOIN + GROUP BY.
    //   - 최근 days 기간의 행만 조인/집계 → 뷰 전체 집계(풀스캔) 회피, 테이블이 커져도 효율적.
    //   - 값은 SUM(visits)로 pgAdmin 뷰(apm_page_visit_daily)와 동일.
    //   - 방문 0인 날(오늘 포함)도 COALESCE로 0을 채워 그래프가 끊기지 않음.
    //   - 일자 경계는 한국시간(Asia/Seoul) 기준 — 최근 days일까지.
    return this.prisma.$queryRaw<
      Array<{ bucket: string; count: bigint | number }>
    >`
      SELECT TO_CHAR(d.day, 'MM-DD') AS bucket,
             COALESCE(SUM(p.visits), 0) AS count
      FROM generate_series(
             ((NOW() AT TIME ZONE 'Asia/Seoul')::date - ((${days}::int - 1) * INTERVAL '1 day'))::date,
             (NOW() AT TIME ZONE 'Asia/Seoul')::date,
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN apm_page_visits p ON p.visit_day = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
  }

  async findSiteClickSeriesDays(days: number) {
    // 데이터 없는 날도 0으로 채우기 (generate_series + LEFT JOIN). 일자 경계는 한국시간 기준.
    return this.prisma.$queryRaw<
      Array<{ bucket: string; count: bigint | number }>
    >`
      SELECT TO_CHAR(d.day, 'MM-DD') AS bucket,
             COUNT(c.id) AS count
      FROM generate_series(
             ((NOW() AT TIME ZONE 'Asia/Seoul')::date - ((${days}::int - 1) * INTERVAL '1 day'))::date,
             (NOW() AT TIME ZONE 'Asia/Seoul')::date,
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN apm_site_clicks c
        ON c.created_at >= d.day::timestamp AT TIME ZONE 'Asia/Seoul'
       AND c.created_at < (d.day + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul'
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
  }

  async findYoutubeClickSeriesDays(days: number) {
    // 데이터 없는 날도 0으로 채우기 (generate_series + LEFT JOIN). 일자 경계는 한국시간 기준.
    return this.prisma.$queryRaw<
      Array<{ bucket: string; count: bigint | number }>
    >`
      SELECT TO_CHAR(d.day, 'MM-DD') AS bucket,
             COUNT(c.id) AS count
      FROM generate_series(
             ((NOW() AT TIME ZONE 'Asia/Seoul')::date - ((${days}::int - 1) * INTERVAL '1 day'))::date,
             (NOW() AT TIME ZONE 'Asia/Seoul')::date,
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN apm_youtube_clicks c
        ON c.created_at >= d.day::timestamp AT TIME ZONE 'Asia/Seoul'
       AND c.created_at < (d.day + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul'
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
  }

  async findPageVisits() {
    return this.prisma.$queryRaw<VisitRow[]>`
      SELECT path, device_type, SUM(visits) AS count
      FROM apm_page_visits
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY path, device_type
      ORDER BY count DESC
      LIMIT 20
    `;
  }

  /**
   * 국가/OS/브라우저별 방문 합계(각 차원 상위 20)를 한 번의 왕복으로 조회.
   * GROUPING SETS로 테이블을 단 한 번만 스캔해 세 차원을 동시 집계하고,
   * 차원별 ROW_NUMBER로 상위 20만 남김 — 집계는 DB가 수행. (해당 컬럼들은 NOT NULL이라 GROUPING() 판별이 안전)
   */
  async findDimensionVisits(): Promise<DimensionVisitRow[]> {
    return this.prisma.$queryRaw<DimensionVisitRow[]>`
      WITH agg AS (
        SELECT
          CASE
            WHEN GROUPING(country_code) = 0 THEN 'country'
            WHEN GROUPING(os_name) = 0 THEN 'os'
            ELSE 'browser'
          END AS dim,
          CASE
            WHEN GROUPING(country_code) = 0 THEN country_code
            WHEN GROUPING(os_name) = 0 THEN os_name
            ELSE browser_name
          END AS name,
          SUM(visits) AS count
        FROM apm_page_visits
        GROUP BY GROUPING SETS ((country_code), (os_name), (browser_name))
      ),
      ranked AS (
        SELECT dim, name, count,
               ROW_NUMBER() OVER (PARTITION BY dim ORDER BY count DESC) AS rn
        FROM agg
      )
      SELECT dim, name, count
      FROM ranked
      WHERE rn <= 20
      ORDER BY dim, count DESC
    `;
  }

  async findYoutubeClickTotal(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
      SELECT COUNT(*) AS total FROM apm_youtube_clicks
    `;
    return Number(rows[0]?.total ?? 0);
  }

  async findSiteClicks() {
    return this.prisma.$queryRaw<SiteClickRow[]>`
      SELECT MAX(site_name) AS site_name, site_href, site_category, COUNT(*) AS click_count
      FROM apm_site_clicks
      GROUP BY site_href, site_category
      ORDER BY click_count DESC
      LIMIT 20
    `;
  }

  async saveDockerMetric(
    container: ContainerName,
    input: {
      cpuPercent: number;
      memUsedMb: number;
      memTotalMb: number;
      memPercent: number;
    },
  ): Promise<void> {
    const table = DOCKER_TABLE[container];
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO ${table} (cpu_percent, mem_used_mb, mem_total_mb, mem_percent, created_at)
       VALUES ($1::numeric, $2::numeric::int, $3::numeric::int, $4::numeric, NOW())`,
      input.cpuPercent,
      input.memUsedMb,
      input.memTotalMb,
      input.memPercent,
    );
  }

  async findDockerMetricSeries(
    container: ContainerName,
    days: number,
  ): Promise<ContainerHistoryRow[]> {
    const table = DOCKER_TABLE[container];
    return this.prisma.$queryRawUnsafe<ContainerHistoryRow[]>(
      // 버킷/라벨은 한국시간(KST) 기준 — 그래프 시각이 운영자 기준과 일치하도록.
      `SELECT TO_CHAR(DATE_TRUNC('hour', created_at AT TIME ZONE 'Asia/Seoul'), 'MM-DD HH24:MI') AS bucket,
              ROUND(AVG(cpu_percent)::numeric, 2)::float AS avg_cpu,
              ROUND(AVG(mem_percent)::numeric, 2)::float AS avg_mem,
              ROUND(AVG(mem_used_mb))::int AS avg_mem_used_mb
       FROM ${table}
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY DATE_TRUNC('hour', created_at AT TIME ZONE 'Asia/Seoul')
       ORDER BY DATE_TRUNC('hour', created_at AT TIME ZONE 'Asia/Seoul') ASC`,
      days,
    );
  }

  async saveResourceBreakdown(input: {
    containers: Record<
      ContainerName,
      { cpuPercent: number; memUsedMb: number }
    >;
    dockerOverheadCpuPercent: number;
    dockerOverheadMemMb: number;
    osOtherCpuPercent: number;
    osOtherMemMb: number;
    hostCpuPercent: number;
    hostMemUsedMb: number;
    hostMemTotalMb: number;
  }): Promise<void> {
    const c = input.containers;
    await this.prisma.$executeRaw`
      INSERT INTO host_resource_breakdown
        (nest_cpu_percent, nest_mem_used_mb, nginx_cpu_percent, nginx_mem_used_mb,
         redis_cpu_percent, redis_mem_used_mb, postgres_cpu_percent, postgres_mem_used_mb,
         docker_overhead_cpu_percent, docker_overhead_mem_mb, os_other_cpu_percent,
         os_other_mem_mb, host_cpu_percent, host_mem_used_mb, host_mem_total_mb, created_at)
      VALUES (
        ${c.nest.cpuPercent}::numeric, ${Math.round(c.nest.memUsedMb)},
        ${c.nginx.cpuPercent}::numeric, ${Math.round(c.nginx.memUsedMb)},
        ${c.redis.cpuPercent}::numeric, ${Math.round(c.redis.memUsedMb)},
        ${c.postgres.cpuPercent}::numeric, ${Math.round(c.postgres.memUsedMb)},
        ${input.dockerOverheadCpuPercent}::numeric,
        ${Math.round(input.dockerOverheadMemMb)},
        ${input.osOtherCpuPercent}::numeric,
        ${Math.round(input.osOtherMemMb)},
        ${input.hostCpuPercent}::numeric,
        ${Math.round(input.hostMemUsedMb)},
        ${Math.round(input.hostMemTotalMb)},
        NOW()
      )
    `;
  }

  /**
   * 기간(from~to)을 bucketSeconds 단위로 묶은 자원 분해 추세.
   * KST(+09:00)는 분 단위 오프셋이 없어 epoch를 잘라도 시/10분 경계가 그대로 맞으므로,
   * 버킷은 epoch 기준으로 나누고 라벨만 KST로 변환한다.
   * bucketSeconds/labelFormat은 서비스가 정하는 고정값(사용자 입력이 아님)이라 인라인한다.
   */
  async findResourceBreakdownSeries(range: {
    from: Date;
    to: Date;
    bucketSeconds: number;
    labelFormat: string;
  }): Promise<ResourceBreakdownHistoryRow[]> {
    const sec = Math.trunc(range.bucketSeconds);
    const slot = `floor(extract(epoch from created_at) / ${sec})`;
    const label = range.labelFormat.replace(/'/g, '');
    return this.prisma.$queryRawUnsafe<ResourceBreakdownHistoryRow[]>(
      `
      SELECT TO_CHAR(to_timestamp(${slot} * ${sec}) AT TIME ZONE 'Asia/Seoul', '${label}') AS bucket,
             ROUND(AVG(nest_cpu_percent)::numeric, 2)::float AS avg_nest_cpu,
             ROUND(AVG(nest_mem_used_mb))::int AS avg_nest_mem_mb,
             ROUND(AVG(nginx_cpu_percent)::numeric, 2)::float AS avg_nginx_cpu,
             ROUND(AVG(nginx_mem_used_mb))::int AS avg_nginx_mem_mb,
             ROUND(AVG(redis_cpu_percent)::numeric, 2)::float AS avg_redis_cpu,
             ROUND(AVG(redis_mem_used_mb))::int AS avg_redis_mem_mb,
             ROUND(AVG(postgres_cpu_percent)::numeric, 2)::float AS avg_postgres_cpu,
             ROUND(AVG(postgres_mem_used_mb))::int AS avg_postgres_mem_mb,
             ROUND(AVG(docker_overhead_cpu_percent)::numeric, 2)::float AS avg_docker_overhead_cpu,
             ROUND(AVG(docker_overhead_mem_mb))::int AS avg_docker_overhead_mem_mb,
             ROUND(AVG(os_other_cpu_percent)::numeric, 2)::float AS avg_os_other_cpu,
             ROUND(AVG(os_other_mem_mb))::int AS avg_os_other_mem_mb,
             ROUND(AVG(host_cpu_percent)::numeric, 2)::float AS avg_host_cpu,
             ROUND(AVG(host_mem_used_mb))::int AS avg_host_mem_mb,
             ROUND(AVG(host_mem_total_mb))::int AS avg_host_mem_total_mb
      FROM host_resource_breakdown
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY ${slot}
      ORDER BY ${slot} ASC
    `,
      range.from,
      range.to,
    );
  }

  async deleteResourceBreakdownOlderThan(retentionDays: number): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM host_resource_breakdown WHERE created_at < NOW() - (${retentionDays}::int * INTERVAL '1 day')
    `;
  }

  /** 기간 내 컨테이너 CPU/MEM 집계(평균/최대/최소/p95, 메모리 피크). */
  async findContainerAggregate(
    container: ContainerName,
    days: number,
  ): Promise<ContainerAggregateRow | undefined> {
    const table = DOCKER_TABLE[container];
    const rows = await this.prisma.$queryRawUnsafe<ContainerAggregateRow[]>(
      `SELECT
         ROUND(AVG(cpu_percent)::numeric, 2)::float AS avg_cpu,
         ROUND(MAX(cpu_percent)::numeric, 2)::float AS max_cpu,
         ROUND(MIN(cpu_percent)::numeric, 2)::float AS min_cpu,
         ROUND(
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cpu_percent)::numeric, 2
         )::float AS p95_cpu,
         ROUND(AVG(mem_percent)::numeric, 2)::float AS avg_mem_pct,
         ROUND(MAX(mem_percent)::numeric, 2)::float AS peak_mem_pct,
         MAX(mem_used_mb)::int AS peak_mem_used_mb,
         COUNT(*)::int AS sample_count
       FROM ${table}
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      days,
    );
    return rows[0];
  }

  /** 시간대(0~23시, 한국시간)별 평균/최대 CPU — 특정 시간대 스파이크 탐지용. */
  async findContainerHourlyCpu(
    container: ContainerName,
    days: number,
  ): Promise<ContainerHourlyCpuRow[]> {
    const table = DOCKER_TABLE[container];
    return this.prisma.$queryRawUnsafe<ContainerHourlyCpuRow[]>(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS hour,
              ROUND(AVG(cpu_percent)::numeric, 2)::float AS avg_cpu,
              ROUND(MAX(cpu_percent)::numeric, 2)::float AS max_cpu
       FROM ${table}
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY 1
       ORDER BY 1`,
      days,
    );
  }

  /** 서비스 변경 이벤트 1건 기록. */
  async recordContainerEvent(input: {
    service: string;
    eventType: string;
    detail: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO container_events (service, event_type, detail, occurred_at, detected_at)
      VALUES (
        ${input.service},
        ${input.eventType},
        ${input.detail},
        ${input.occurredAt},
        NOW()
      )
    `;
  }

  /** 최근 N일 변경 이벤트 (최신순). */
  async findRecentContainerEvents(
    days: number,
    limit: number,
  ): Promise<
    Array<{
      service: string;
      event_type: string;
      detail: string | null;
      occurred_at: Date;
    }>
  > {
    return this.prisma.$queryRaw<
      Array<{
        service: string;
        event_type: string;
        detail: string | null;
        occurred_at: Date;
      }>
    >`
      SELECT service, event_type, detail, occurred_at
      FROM container_events
      WHERE occurred_at >= NOW() - (${days}::int * INTERVAL '1 day')
      ORDER BY occurred_at DESC
      LIMIT ${limit}
    `;
  }

  /** 에러 1건 기록. 컬럼 길이에 맞춰 자른다(문자열 필드 오버플로 방지). */
  async recordError(input: {
    statusCode: number;
    errorName: string;
    method: string;
    path: string;
    message: string;
    stack: string | null;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO error_logs (status_code, error_name, method, path, message, stack)
      VALUES (
        ${input.statusCode},
        ${input.errorName.slice(0, 80)},
        ${input.method.slice(0, 10)},
        ${input.path.slice(0, 512)},
        ${input.message.slice(0, 2000)},
        ${input.stack ? input.stack.slice(0, 8000) : null}
      )
    `;
  }

  /** 최근 N일 에러 로그 (최신순). statusClass로 4xx/5xx 필터. */
  async findRecentErrors(input: {
    days: number;
    statusClass: 'all' | '4xx' | '5xx';
    limit: number;
  }): Promise<ErrorLogRow[]> {
    const min = input.statusClass === '5xx' ? 500 : 400;
    const max = input.statusClass === '4xx' ? 500 : 600;
    return this.prisma.$queryRaw<ErrorLogRow[]>`
      SELECT id, status_code, error_name, method, path, message, stack, created_at
      FROM error_logs
      WHERE created_at >= NOW() - (${input.days}::int * INTERVAL '1 day')
        AND status_code >= ${min}
        AND status_code < ${max}
      ORDER BY created_at DESC
      LIMIT ${input.limit}
    `;
  }

  /** 오래된 에러 로그 정리. 삭제 건수 반환. */
  async pruneErrorLogs(retentionDays: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ id: bigint }>>`
      DELETE FROM error_logs
      WHERE created_at < NOW() - (${retentionDays}::int * INTERVAL '1 day')
      RETURNING id
    `;
    return rows.length;
  }

  async deleteDockerMetricsOlderThan(
    container: ContainerName,
    retentionDays: number,
  ): Promise<void> {
    const table = DOCKER_TABLE[container];
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
      retentionDays,
    );
  }

  async deleteMetricRowsOlderThan(
    tableName: RetentionTable,
    retentionDays: number,
  ) {
    const chunkSize = 5000;
    const maxBatches = 200;
    let totalDeleted = 0;

    for (let batch = 1; batch <= maxBatches; batch += 1) {
      const deleted = await this.deleteMetricRowsOlderThanFrom(
        tableName,
        retentionDays,
        chunkSize,
      );
      totalDeleted += deleted;

      if (deleted < chunkSize) return totalDeleted;
      await sleep(25);
    }

    return totalDeleted;
  }

  private async deleteMetricRowsOlderThanFrom(
    tableName: RetentionTable,
    retentionDays: number,
    chunkSize: number,
  ) {
    switch (tableName) {
      case 'apm_request_timings':
        return this.deleteRequestTimingRowsOlderThan(retentionDays, chunkSize);
      case 'apm_page_load_timings':
        return this.deleteRowsOlderThan(
          'apm_page_load_timings',
          retentionDays,
          chunkSize,
        );
    }
  }

  private async deleteRowsOlderThan(
    table: 'apm_page_load_timings',
    retentionDays: number,
    chunkSize: number,
  ) {
    const deleted = await this.prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
      `
      DELETE FROM ${table}
      WHERE id IN (
        SELECT id
        FROM ${table}
        WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
        ORDER BY id ASC
        LIMIT $2
      )
      RETURNING id
      `,
      retentionDays,
      chunkSize,
    );
    return deleted.length;
  }

  private async deleteRequestTimingRowsOlderThan(
    retentionDays: number,
    chunkSize: number,
  ) {
    const deleted = await this.prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
      `
      DELETE FROM apm_request_timings
      WHERE id IN (
        SELECT id
        FROM apm_request_timings
        WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
        ORDER BY id ASC
        LIMIT $2
      )
      RETURNING id
      `,
      retentionDays,
      chunkSize,
    );
    return deleted.length;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
