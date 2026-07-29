import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { runIfLockAcquired } from '../../common/cron-lock.util';
import { REDIS_CLIENT } from '../../redis/redis.module';
import {
  type DeviceType,
  type VisitRow,
  MonitoringRepository,
} from './monitoring.repository';

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
  constructor(
    private readonly monitoringRepo: MonitoringRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    // PM2 cluster: 스키마 부트스트랩은 0번 워커만(또는 비클러스터=undefined). 동시 DDL 경쟁 방지.
    const inst = process.env.NODE_APP_INSTANCE;
    if (inst !== undefined && inst !== '0') return;
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

  /**
   * 페이지 로딩 추이(실사용자 RUM). 달력(from~to, KST) 기준.
   * from===to면 그날 시간별, 아니면 일별. 잘못된/누락 입력은 오늘 하루로 폴백.
   */
  async getPageLoadSeries(from?: string, to?: string) {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    // KST(UTC+9) 오늘 날짜 문자열
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    let start = from && dateRe.test(from) ? from : todayKst;
    let end = to && dateRe.test(to) ? to : start;
    if (start > end) [start, end] = [end, start];
    // 범위 상한 90일 (일별 버킷 과다 방지)
    const MAX_DAYS = 90;
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    if ((endMs - startMs) / 86_400_000 > MAX_DAYS - 1) {
      start = new Date(endMs - (MAX_DAYS - 1) * 86_400_000)
        .toISOString()
        .slice(0, 10);
    }
    const rows = await this.monitoringRepo.findPageLoadSeries(start, end);
    return rows.map((row) => ({
      bucket: row.bucket,
      date: row.date,
      ttfb: row.avg_ttfb ?? null,
      dcl: row.avg_dcl ?? null,
      lcp: row.avg_lcp ?? null,
      load: row.avg_load ?? null,
      count: Number(row.count),
    }));
  }

  /** 로딩 추이 달력의 하한(첫 데이터 날짜). 이 이전은 선택/표시 안 함. */
  async getPageLoadEarliest(): Promise<{ earliest: string | null }> {
    return { earliest: await this.monitoringRepo.findEarliestPageLoadDate() };
  }

  @Cron('0 0 3 * * *')
  async cleanupMetricRetention() {
    await runIfLockAcquired(this.redis, 'cleanupMetricRetention', async () => {
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
    });
  }

  async getDashboard(pvDays = 14): Promise<AdminMonitoringDashboard> {
    const safePvDays = Math.max(1, Math.min(30, Math.trunc(pvDays)));
    // 서로 의존 없는 조회들은 병렬로(Promise.all) 실행 → 대시보드 로딩 = 가장 느린 1개 수준.
    const [
      summary,
      siteClickSeriesRows,
      youtubeClickSeriesRows,
      visitRows,
      dimensionRows,
      siteClickRows,
      pageVisitSeriesRows,
      youtubeClickTotal,
    ] = await Promise.all([
      this.monitoringRepo.findSummary(this.SLOW_THRESHOLD_MS),
      this.monitoringRepo.findSiteClickSeriesDays(7),
      this.monitoringRepo.findYoutubeClickSeriesDays(7),
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
