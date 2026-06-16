import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  type DeviceType,
  type VisitRow,
  MonitoringRepository,
} from './repositories/monitoring.repository';

export interface AdminMonitoringDashboard {
  summary: {
    windowMinutes: number;
    avgDurationMs: number;
    pageVisits: number;
    deviceCounts: {
      mobile: number;
      desktop: number;
      tablet: number;
      bot: number;
    };
  };
  siteClickSeries: Array<{ minute: string; count: number }>;
  youtubeClickSeries: Array<{ minute: string; count: number }>;
  sectionSeries: Array<{
    minute: string;
    label: string;
    avgDurationMs: number;
    count: number;
  }>;
  pageVisits: VisitRow[];
  countryVisits: Array<{ countryCode: string; count: number }>;
  osVisits: Array<{ osName: string; count: number }>;
  browserVisits: Array<{ browserName: string; count: number }>;
  siteClicks: Array<{
    siteName: string;
    siteHref: string;
    siteCategory: string;
    clickCount: number;
  }>;
  pageVisitSeries: Array<{ day: string; count: number }>;
  youtubeClickTotal: number;
}

@Injectable()
export class AdminMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(AdminMonitoringService.name);
  private readonly SLOW_THRESHOLD_MS = 1200;
  private readonly MONITORING_METRIC_RETENTION_DAYS = 30;
  // 주기적으로 호출해 응답시간 샘플을 보장하는 핵심 경로들.
  // 호출 자체가 전역 미들웨어로 apm_request_timings에 기록됨(별도 저장 없음).
  // 경로→라벨 매핑은 findSectionSeries(repository)에 정의됨 — 변경 시 함께 맞출 것.
  private readonly probeTargets: string[] = [
    '/api/sites',
    '/api/characters/stat-builds',
    '/api/streamers/popular?offset=0&limit=8',
  ];
  constructor(private readonly monitoringRepo: MonitoringRepository) {}

  async onModuleInit() {
    await this.monitoringRepo.ensureMonitoringTables();
  }

  async recordRequest(input: {
    scope: 'route' | 'section';
    name: string;
    path?: string;
    method?: string;
    statusCode?: number;
    durationMs: number;
  }) {
    await this.monitoringRepo.recordRequest(input);
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
    await this.monitoringRepo.recordPageVisit(input);
  }

  async recordSiteClick(input: {
    siteName: string;
    siteHref: string;
    siteCategory: string;
    deviceType: DeviceType;
  }) {
    await this.monitoringRepo.recordSiteClick(input);
  }

  async recordYoutubeClick(input: {
    videoId: string;
    videoTitle: string;
    channelTitle: string;
    deviceType: DeviceType;
  }) {
    await this.monitoringRepo.recordYoutubeClick(input);
  }

  /** RUM(실사용자) 페이지 로딩 측정값 기록. 값은 0~600000ms로 클램프, 비정상은 null. */
  async recordPageLoad(input: {
    path: string;
    deviceType: string;
    ttfb: number | null;
    dcl: number | null;
    lcp: number | null;
    load: number | null;
  }) {
    const clamp = (v: number | null): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0
        ? Math.min(600_000, Math.round(v))
        : null;
    await this.monitoringRepo.recordPageLoad({
      path: input.path.slice(0, 255) || '/',
      deviceType: input.deviceType.slice(0, 16) || 'unknown',
      ttfbMs: clamp(input.ttfb),
      dclMs: clamp(input.dcl),
      lcpMs: clamp(input.lcp),
      loadMs: clamp(input.load),
    });
  }

  /** 배포 이벤트 기록(GitHub Actions가 전달). nest/next만 허용. */
  async recordDeployEvent(input: {
    service: 'nest' | 'next';
    sha?: string;
    detail?: string;
  }): Promise<void> {
    const detail =
      input.detail ?? (input.sha ? `sha:${input.sha.slice(0, 12)}` : null);
    await this.monitoringRepo.recordContainerEvent({
      service: input.service,
      eventType: 'deploy',
      detail,
      occurredAt: new Date(),
    });
  }

  /** 최근 변경(재시작/배포) 이벤트 — AI 컨텍스트/타임라인용. */
  async getRecentContainerEvents(days = 14, limit = 30) {
    const rows = await this.monitoringRepo.findRecentContainerEvents(
      days,
      limit,
    );
    return rows.map((r) => ({
      service: r.service,
      eventType: r.event_type,
      detail: r.detail,
      occurredAt: r.occurred_at,
    }));
  }

  /** 페이지 로딩 추이(실사용자 RUM). days에 따라 버킷 크기 자동 선택. */
  async getPageLoadSeries(days: number) {
    const safeDays = Math.max(1, Math.min(30, Math.trunc(days)));
    // 1일: 1시간 단위, 7일/30일: 1일(24시간) 단위
    const bucketHours = safeDays <= 1 ? 1 : 24;
    const rows = await this.monitoringRepo.findPageLoadSeries(
      safeDays,
      bucketHours,
    );
    return rows.map((row) => ({
      bucket: row.bucket,
      ttfb: row.avg_ttfb ?? null,
      dcl: row.avg_dcl ?? null,
      lcp: row.avg_lcp ?? null,
      load: row.avg_load ?? null,
      count: Number(row.count),
    }));
  }

  @Cron('0 0 * * * *')
  async probeApis() {
    const base =
      process.env.MONITORING_PROBE_BASE_URL ??
      `http://127.0.0.1:${process.env.PORT ?? 3001}`;
    // 핵심 경로를 병렬 호출. 성공하면 응답시간/상태코드는 전역 미들웨어가
    // apm_request_timings에 기록한다(이중 기록 제거). 단 fetch 자체가 실패(네트워크/타임아웃)하면
    // 미들웨어가 돌지 않으므로, 장애가 누락되지 않도록 catch에서 실패(status 0)를 직접 기록하고 완료까지 대기한다.
    await Promise.all(
      this.probeTargets.map(async (path) => {
        const started = process.hrtime.bigint();
        try {
          await fetch(`${base}${path}`, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          const durationMs =
            Number(process.hrtime.bigint() - started) / 1_000_000;
          const name = path.split('?')[0]; // 미들웨어 기록과 동일하게 쿼리스트링 제거
          await this.recordRequest({
            scope: 'route',
            name,
            path: name,
            method: 'GET',
            statusCode: 0,
            durationMs,
          }).catch(() => undefined);
        }
      }),
    );
  }

  @Cron('0 0 3 * * *')
  async cleanupMetricRetention() {
    try {
      const deletedRequests =
        await this.monitoringRepo.deleteMetricRowsOlderThan(
          'apm_request_timings',
          this.MONITORING_METRIC_RETENTION_DAYS,
        );
      const deletedPageLoads =
        await this.monitoringRepo.deleteMetricRowsOlderThan(
          'apm_page_load_timings',
          this.MONITORING_METRIC_RETENTION_DAYS,
        );

      this.logger.log(
        `monitoring retention cleanup completed: requests=${deletedRequests}, pageLoads=${deletedPageLoads}`,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `monitoring retention cleanup failed: ${toErrorMessage(err)}`,
      );
    }
  }

  async getDashboard(
    rangeDays = 7,
    pvDays = 14,
  ): Promise<AdminMonitoringDashboard> {
    const safeRangeDays = Math.max(1, Math.min(30, Math.trunc(rangeDays)));
    // 섹션(기능별 응답) 차트 버킷: 1일 보기만 시간 단위, 그 외는 일(24h) 단위로 묶어 날짜만 표시.
    const bucketHours = safeRangeDays <= 1 ? 1 : 24;
    const safePvDays = Math.max(1, Math.min(30, Math.trunc(pvDays)));
    // 서로 의존 없는 조회들은 병렬로(Promise.all) 실행 → 대시보드 로딩 = 가장 느린 1개 수준.
    const [
      summary,
      siteClickSeriesRows,
      youtubeClickSeriesRows,
      sectionSeries,
      visitRows,
      dimensionRows,
      siteClickRows,
      pageVisitSeriesRows,
      youtubeClickTotal,
    ] = await Promise.all([
      this.monitoringRepo.findSummary(this.SLOW_THRESHOLD_MS),
      this.monitoringRepo.findSiteClickSeriesDays(14),
      this.monitoringRepo.findYoutubeClickSeriesDays(14),
      this.monitoringRepo.findSectionSeries(bucketHours, safeRangeDays),
      this.monitoringRepo.findPageVisits(),
      this.monitoringRepo.findDimensionVisits(),
      this.monitoringRepo.findSiteClicks(),
      this.monitoringRepo.findPageVisitSeriesDays(safePvDays),
      this.monitoringRepo.findYoutubeClickTotal(),
    ]);
    // 한 번의 왕복으로 받은 차원 데이터를 국가/OS/브라우저로 분리.
    const countryRows = dimensionRows.filter((r) => r.dim === 'country');
    const osRows = dimensionRows.filter((r) => r.dim === 'os');
    const browserRows = dimensionRows.filter((r) => r.dim === 'browser');

    return {
      summary: {
        windowMinutes: 60,
        avgDurationMs: summary?.avg_duration_ms ?? 0,
        pageVisits: Number(summary?.page_visits ?? 0),
        deviceCounts: {
          mobile: Number(summary?.mobile_visits ?? 0),
          desktop: Number(summary?.desktop_visits ?? 0),
          tablet: Number(summary?.tablet_visits ?? 0),
          bot: Number(summary?.bot_visits ?? 0),
        },
      },
      siteClickSeries: siteClickSeriesRows.map((row) => ({
        minute: row.bucket,
        count: Number(row.count),
      })),
      youtubeClickSeries: youtubeClickSeriesRows.map((row) => ({
        minute: row.bucket,
        count: Number(row.count),
      })),
      sectionSeries: sectionSeries.map((row) => ({
        minute: row.bucket,
        label: row.label,
        avgDurationMs: row.avg_duration_ms ?? 0,
        count: Number(row.count),
      })),
      pageVisits: visitRows.map((row) => ({
        ...row,
        count: Number(row.count),
      })) as VisitRow[],
      countryVisits: countryRows.map((row) => ({
        countryCode: row.name || 'UNKNOWN',
        count: Number(row.count),
      })),
      osVisits: osRows.map((row) => ({
        osName: row.name || 'Unknown',
        count: Number(row.count),
      })),
      browserVisits: browserRows.map((row) => ({
        browserName: row.name || 'Unknown',
        count: Number(row.count),
      })),
      siteClicks: siteClickRows.map((row) => ({
        siteName: row.site_name,
        siteHref: row.site_href,
        siteCategory: row.site_category,
        clickCount: Number(row.click_count),
      })),
      pageVisitSeries: pageVisitSeriesRows.map((row) => ({
        day: row.bucket,
        count: Number(row.count),
      })),
      youtubeClickTotal,
    };
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
