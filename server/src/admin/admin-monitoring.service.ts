import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Pool } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import * as os from 'os';
import { DB_POOL } from '../db/db.module';

type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';

interface SummaryRow extends RowDataPacket {
  total_requests: number;
  error_count: number;
  slow_count: number;
  avg_duration_ms: number;
  page_visits: number;
  mobile_visits: number;
  desktop_visits: number;
  tablet_visits: number;
  bot_visits: number;
}

interface TimedGroupRow extends RowDataPacket {
  bucket: string;
  label: string;
  avg_duration_ms: number;
  count: number;
}

interface RequestRow extends RowDataPacket {
  path: string;
  method: string;
  status_code: number;
  duration_ms: number;
  created_at: string | Date;
}

interface VisitRow extends RowDataPacket {
  path: string;
  device_type: DeviceType;
  count: number;
}

interface DimensionRow extends RowDataPacket {
  name: string;
  count: number;
}

interface ColumnExistsRow extends RowDataPacket {
  count: number;
}

interface SystemRow extends RowDataPacket {
  created_at: string | Date;
  cpu_percent: number;
  memory_percent: number;
  rss_mb: number;
  heap_used_mb: number;
  total_mem_mb: number;
}

interface ApiStatRow extends RowDataPacket {
  path: string;
  method: string;
  request_count: number;
  avg_duration_ms: number;
}

interface ProbeStatRow extends RowDataPacket {
  api_key: string;
  path: string;
  method: string;
  cache_type: 'redis' | 'no-cache';
  request_count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  last_duration_ms: number;
  last_status_code: number;
  last_success: number;
}

interface SiteClickRow extends RowDataPacket {
  site_name: string;
  site_href: string;
  site_category: string;
  click_count: number;
}

export interface CurrentSystemSnapshot {
  at: string;
  cpuPercent: number;
  memoryPercent: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  totalMemMb: number;
  loadAvg1m: number;
}

export interface AdminMonitoringDashboard {
  summary: {
    windowMinutes: number;
    totalRequests: number;
    errorCount: number;
    errorRate: number;
    slowCount: number;
    slowThresholdMs: number;
    avgDurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
    pageVisits: number;
    deviceCounts: {
      mobile: number;
      desktop: number;
      tablet: number;
      bot: number;
    };
    latestSystem: {
      created_at: string;
      cpu_percent: number;
      memory_percent: number;
      rss_mb: number;
      heap_used_mb: number;
      total_mem_mb: number;
    } | null;
  };
  requestSeries: Array<{
    minute: string;
    avgDurationMs: number;
    count: number;
  }>;
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
  systemSeries: Array<{
    at: string;
    cpuPercent: number;
    memoryPercent: number;
    rssMb: number;
    heapUsedMb: number;
    totalMemMb: number;
  }>;
  slowRequests: Array<{
    path: string;
    method: string;
    status_code: number;
    duration_ms: number;
    created_at: string;
  }>;
  apiStats: Array<{
    path: string;
    method: string;
    requestCount: number;
    avgDurationMs: number;
    level: 'low' | 'near' | 'high';
    levelLabel: 'low' | 'near' | 'high';
  }>;
  probeStats: Array<{
    apiKey: string;
    path: string;
    method: string;
    cacheType: 'redis' | 'no-cache';
    requestCount: number;
    avgDurationMs: number;
    maxDurationMs: number;
    lastDurationMs: number;
    lastStatusCode: number;
    lastSuccess: boolean;
  }>;
  siteClicks: Array<{
    siteName: string;
    siteHref: string;
    siteCategory: string;
    clickCount: number;
  }>;
}

@Injectable()
export class AdminMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(AdminMonitoringService.name);
  private readonly SLOW_THRESHOLD_MS = 1200;
  private readonly METRIC_RETENTION_DAYS = 7;
  private readonly probeTargets: Array<{
    apiKey: string;
    path: string;
    method: 'GET';
    cacheType: 'redis' | 'no-cache';
  }> = [
    {
      apiKey: 'sites',
      path: '/api/sites',
      method: 'GET',
      cacheType: 'no-cache',
    },
    {
      apiKey: 'stat-builds',
      path: '/api/characters/stat-builds',
      method: 'GET',
      cacheType: 'redis',
    },
    {
      apiKey: 'youtube',
      path: '/api/streamers/popular?offset=0&limit=8',
      method: 'GET',
      cacheType: 'redis',
    },
  ];
  private lastCpuUsage = process.cpuUsage();
  private lastSampleAt = Date.now();

  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.ensureTables();
    await this.recordSystemSnapshot();
  }

  async recordRequest(input: {
    scope: 'route' | 'section';
    name: string;
    path?: string;
    method?: string;
    statusCode?: number;
    durationMs: number;
  }) {
    await this.pool.execute(
      `INSERT INTO apm_request_timings
        (scope, name, path, method, status_code, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        input.scope,
        input.name,
        input.path ?? null,
        input.method ?? null,
        input.statusCode ?? null,
        Math.max(0, Math.round(input.durationMs)),
      ],
    );
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
    await this.pool.execute(
      `INSERT INTO apm_page_visits
        (path, device_type, user_agent, referrer, country_code, os_name, browser_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
          visits = visits + 1,
          user_agent = VALUES(user_agent),
          referrer = VALUES(referrer),
          country_code = VALUES(country_code),
          os_name = VALUES(os_name),
          browser_name = VALUES(browser_name),
          last_seen_at = NOW()`,
      [
        input.path,
        input.deviceType,
        input.userAgent,
        input.referrer,
        input.countryCode,
        input.osName,
        input.browserName,
      ],
    );
  }

  async recordSiteClick(input: {
    siteName: string;
    siteHref: string;
    siteCategory: string;
    deviceType: DeviceType;
  }) {
    await this.pool.execute(
      `INSERT INTO apm_site_clicks
        (site_name, site_href, site_category, device_type, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [input.siteName, input.siteHref, input.siteCategory, input.deviceType],
    );
  }

  async recordYoutubeClick(input: {
    videoId: string;
    videoTitle: string;
    channelTitle: string;
    deviceType: DeviceType;
  }) {
    await this.pool.execute(
      `INSERT INTO apm_youtube_clicks
        (video_id, video_title, channel_title, device_type, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [input.videoId, input.videoTitle, input.channelTitle, input.deviceType],
    );
  }

  async recordSystemSnapshot() {
    const snapshot = this.buildSystemSnapshot();
    this.lastCpuUsage = snapshot.cpuNow;
    this.lastSampleAt = snapshot.now;
    await this.pool.execute(
      `INSERT INTO apm_system_metrics
        (cpu_percent, memory_percent, rss_mb, heap_used_mb, total_mem_mb, load_avg_1m, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        Number(snapshot.cpuPercent.toFixed(1)),
        Number(snapshot.memoryPercent.toFixed(1)),
        snapshot.rssMb,
        snapshot.heapUsedMb,
        snapshot.totalMemMb,
        Number(snapshot.loadAvg1m.toFixed(2)),
      ],
    );
  }

  getCurrentSystemSnapshot(): CurrentSystemSnapshot {
    const snapshot = this.buildSystemSnapshot();
    return {
      at: new Date(snapshot.now).toISOString(),
      cpuPercent: Number(snapshot.cpuPercent.toFixed(1)),
      memoryPercent: Number(snapshot.memoryPercent.toFixed(1)),
      rssMb: snapshot.rssMb,
      heapUsedMb: snapshot.heapUsedMb,
      heapTotalMb: snapshot.heapTotalMb,
      totalMemMb: snapshot.totalMemMb,
      loadAvg1m: Number(snapshot.loadAvg1m.toFixed(2)),
    };
  }

  private buildSystemSnapshot() {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - this.lastSampleAt);
    const cpuNow = process.cpuUsage();
    const cpuDeltaUs =
      cpuNow.user -
      this.lastCpuUsage.user +
      (cpuNow.system - this.lastCpuUsage.system);
    // Use process CPU utilization over elapsed wall time.
    // This is more intuitive for app monitoring than dividing by host core count.
    const cpuPercent = Math.min(
      100,
      Math.max(0, (cpuDeltaUs / 1000 / elapsedMs) * 100),
    );
    const mem = process.memoryUsage();
    const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const memoryPercent = totalMemMb
      ? Math.min(100, Math.max(0, (rssMb / totalMemMb) * 100))
      : 0;
    const loadAvg1m = os.loadavg()[0] ?? 0;
    return {
      now,
      cpuNow,
      cpuPercent,
      memoryPercent,
      rssMb,
      heapUsedMb,
      heapTotalMb,
      totalMemMb,
      loadAvg1m,
    };
  }

  @Cron('*/5 * * * * *')
  async sampleSystem() {
    await this.recordSystemSnapshot().catch((err: unknown) =>
      this.logger.warn(`system sample failed: ${toErrorMessage(err)}`),
    );
  }

  @Cron('0 */10 * * * *')
  async probeApis() {
    const base =
      process.env.MONITORING_PROBE_BASE_URL ??
      `http://127.0.0.1:${process.env.PORT ?? 3001}`;
    for (const target of this.probeTargets) {
      const started = process.hrtime.bigint();
      let statusCode = 0;
      let success = false;
      try {
        const res = await fetch(`${base}${target.path}`, {
          method: target.method,
          cache: 'no-store',
        });
        statusCode = res.status;
        success = res.ok;
      } catch {
        statusCode = 0;
        success = false;
      }
      const durationMs = Math.max(
        0,
        Math.round(Number(process.hrtime.bigint() - started) / 1_000_000),
      );
      await this.pool.execute(
        `INSERT INTO monitoring_api_probes
          (api_key, path, method, cache_type, status_code, duration_ms, is_success, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          target.apiKey,
          target.path,
          target.method,
          target.cacheType,
          statusCode,
          durationMs,
          success ? 1 : 0,
        ],
      );
    }
  }

  @Cron('0 0 3 * * *')
  async cleanupMetricRetention() {
    try {
      const deletedSystem =
        await this.deleteMetricRowsOlderThan('apm_system_metrics');
      const deletedRequests = await this.deleteMetricRowsOlderThan(
        'apm_request_timings',
      );
      const deletedProbes = await this.deleteMetricRowsOlderThan(
        'monitoring_api_probes',
      );

      this.logger.log(
        `monitoring retention cleanup completed: system=${deletedSystem}, requests=${deletedRequests}, probes=${deletedProbes}`,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `monitoring retention cleanup failed: ${toErrorMessage(err)}`,
      );
    }
  }

  async getDashboard(rangeDays = 7): Promise<AdminMonitoringDashboard> {
    const safeRangeDays = Math.max(1, Math.min(30, Math.trunc(rangeDays)));
    const bucketHours =
      safeRangeDays === 1
        ? 1
        : safeRangeDays === 3
          ? 3
          : safeRangeDays === 7
            ? 7
            : 30;
    const [summaryRows] = await this.pool.execute<SummaryRow[]>(
      `
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN duration_ms >= ? THEN 1 ELSE 0 END) AS slow_count,
        ROUND(AVG(duration_ms)) AS avg_duration_ms,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits) AS page_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'mobile') AS mobile_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'desktop') AS desktop_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'tablet') AS tablet_visits,
        (SELECT COALESCE(SUM(visits), 0) FROM apm_page_visits WHERE device_type = 'bot') AS bot_visits
      FROM apm_request_timings
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      `,
      [this.SLOW_THRESHOLD_MS],
    );
    const summary = summaryRows[0];

    const [durationRows] = await this.pool.execute<
      Array<RowDataPacket & { duration_ms: number }>
    >(
      `
      SELECT duration_ms
      FROM apm_request_timings
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY duration_ms ASC
      `,
    );
    const durations = durationRows.map((r) => r.duration_ms);
    const p95DurationMs = this.percentileFromSorted(durations, 0.95);
    const p99DurationMs = this.percentileFromSorted(durations, 0.99);

    const [requestSeries] = await this.pool.execute<TimedGroupRow[]>(
      `
      SELECT DATE_FORMAT(minute_key, '%H:%i') AS bucket,
             DATE_FORMAT(minute_key, '%H:%i') AS label,
             ROUND(AVG(duration_ms)) AS avg_duration_ms,
             COUNT(*) AS count
      FROM (
        SELECT
          STR_TO_DATE(DATE_FORMAT(created_at, '%Y-%m-%d %H:%i'), '%Y-%m-%d %H:%i') AS minute_key,
          duration_ms
        FROM apm_request_timings
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ) AS request_minutes
      GROUP BY minute_key
      ORDER BY minute_key ASC
      `,
    );

    const [siteClickSeriesRows] = await this.pool.execute<
      Array<RowDataPacket & { bucket: string; count: number }>
    >(
      `
      SELECT DATE_FORMAT(day_key, '%m-%d') AS bucket,
             COUNT(*) AS count
      FROM (
        SELECT DATE(created_at) AS day_key
        FROM apm_site_clicks
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      ) AS site_click_days
      GROUP BY day_key
      ORDER BY day_key ASC
      `,
    );

    const [youtubeClickSeriesRows] = await this.pool.execute<
      Array<RowDataPacket & { bucket: string; count: number }>
    >(
      `
      SELECT DATE_FORMAT(day_key, '%m-%d') AS bucket,
             COUNT(*) AS count
      FROM (
        SELECT DATE(created_at) AS day_key
        FROM apm_youtube_clicks
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      ) AS youtube_click_days
      GROUP BY day_key
      ORDER BY day_key ASC
      `,
    );

    const [sectionSeries] = await this.pool.execute<TimedGroupRow[]>(
      `
      SELECT
        DATE_FORMAT(bucket_start, '%m-%d %H:%i') AS bucket,
        api_key AS label,
        ROUND(AVG(duration_ms)) AS avg_duration_ms,
        COUNT(*) AS count
      FROM (
        SELECT
          FROM_UNIXTIME(
            FLOOR(UNIX_TIMESTAMP(created_at) / (? * 3600)) * (? * 3600)
          ) AS bucket_start,
          api_key,
          duration_ms
        FROM monitoring_api_probes
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ) AS probe_buckets
      GROUP BY bucket_start, api_key
      ORDER BY bucket_start ASC
      `,
      [bucketHours, bucketHours, safeRangeDays],
    );

    const [visitRows] = await this.pool.execute<VisitRow[]>(
      `
      SELECT path, device_type, SUM(visits) AS count
      FROM apm_page_visits
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY path, device_type
      ORDER BY count DESC
      LIMIT 20
      `,
    );

    const [countryRows] = await this.pool.execute<DimensionRow[]>(
      `
      SELECT country_code AS name, SUM(visits) AS count
      FROM apm_page_visits
      GROUP BY country_code
      ORDER BY count DESC
      LIMIT 20
      `,
    );

    const [osRows] = await this.pool.execute<DimensionRow[]>(
      `
      SELECT os_name AS name, SUM(visits) AS count
      FROM apm_page_visits
      GROUP BY os_name
      ORDER BY count DESC
      LIMIT 20
      `,
    );

    const [browserRows] = await this.pool.execute<DimensionRow[]>(
      `
      SELECT browser_name AS name, SUM(visits) AS count
      FROM apm_page_visits
      GROUP BY browser_name
      ORDER BY count DESC
      LIMIT 20
      `,
    );

    const [systemRows] = await this.pool.execute<SystemRow[]>(
      `
      SELECT created_at, cpu_percent, memory_percent, rss_mb, heap_used_mb, total_mem_mb
      FROM apm_system_metrics
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY created_at ASC
      `,
    );

    const [slowRows] = await this.pool.execute<RequestRow[]>(
      `
      SELECT path, method, status_code, duration_ms, created_at
      FROM apm_request_timings
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        AND duration_ms >= ?
      ORDER BY duration_ms DESC
      LIMIT 20
      `,
      [this.SLOW_THRESHOLD_MS],
    );

    const [latestSystemRows] = await this.pool.execute<SystemRow[]>(
      `
      SELECT created_at, cpu_percent, memory_percent, rss_mb, heap_used_mb, total_mem_mb
      FROM apm_system_metrics
      ORDER BY created_at DESC
      LIMIT 1
      `,
    );

    const [apiRows] = await this.pool.execute<ApiStatRow[]>(
      `
      SELECT COALESCE(path, name) AS path,
             COALESCE(method, 'GET') AS method,
             COUNT(*) AS request_count,
             ROUND(AVG(duration_ms)) AS avg_duration_ms
      FROM apm_request_timings
      WHERE scope = 'route'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY COALESCE(path, name), COALESCE(method, 'GET')
      ORDER BY request_count DESC, avg_duration_ms DESC
      LIMIT 30
      `,
    );

    const [probeRows] = await this.pool.execute<ProbeStatRow[]>(
      `
      SELECT p.api_key, p.path, p.method, p.cache_type,
             COUNT(*) AS request_count,
             ROUND(AVG(p.duration_ms)) AS avg_duration_ms,
             MAX(p.duration_ms) AS max_duration_ms,
             SUBSTRING_INDEX(GROUP_CONCAT(p.duration_ms ORDER BY p.created_at DESC), ',', 1) AS last_duration_ms,
             SUBSTRING_INDEX(GROUP_CONCAT(p.status_code ORDER BY p.created_at DESC), ',', 1) AS last_status_code,
             SUBSTRING_INDEX(GROUP_CONCAT(p.is_success ORDER BY p.created_at DESC), ',', 1) AS last_success
      FROM monitoring_api_probes p
      WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
      GROUP BY p.api_key, p.path, p.method, p.cache_type
      ORDER BY avg_duration_ms DESC
      `,
    );

    const [siteClickRows] = await this.pool.execute<SiteClickRow[]>(
      `
      SELECT site_name, site_href, site_category, COUNT(*) AS click_count
      FROM apm_site_clicks
      GROUP BY site_name, site_href, site_category
      ORDER BY click_count DESC
      LIMIT 20
      `,
    );

    const latestSystem = latestSystemRows[0]
      ? {
          created_at: toIsoString(latestSystemRows[0].created_at),
          cpu_percent: latestSystemRows[0].cpu_percent,
          memory_percent: latestSystemRows[0].memory_percent,
          rss_mb: latestSystemRows[0].rss_mb,
          heap_used_mb: latestSystemRows[0].heap_used_mb,
          total_mem_mb: latestSystemRows[0].total_mem_mb,
        }
      : null;

    return {
      summary: {
        windowMinutes: 60,
        totalRequests: summary?.total_requests ?? 0,
        errorCount: summary?.error_count ?? 0,
        errorRate:
          summary && summary.total_requests
            ? Number((summary.error_count / summary.total_requests).toFixed(3))
            : 0,
        slowCount: summary?.slow_count ?? 0,
        slowThresholdMs: this.SLOW_THRESHOLD_MS,
        avgDurationMs: summary?.avg_duration_ms ?? 0,
        p95DurationMs,
        p99DurationMs,
        pageVisits: summary?.page_visits ?? 0,
        deviceCounts: {
          mobile: summary?.mobile_visits ?? 0,
          desktop: summary?.desktop_visits ?? 0,
          tablet: summary?.tablet_visits ?? 0,
          bot: summary?.bot_visits ?? 0,
        },
        latestSystem,
      },
      requestSeries: requestSeries.map((row) => ({
        minute: row.bucket,
        avgDurationMs: row.avg_duration_ms,
        count: row.count,
      })),
      siteClickSeries: siteClickSeriesRows.map((row) => ({
        minute: row.bucket,
        count: row.count,
      })),
      youtubeClickSeries: youtubeClickSeriesRows.map((row) => ({
        minute: row.bucket,
        count: row.count,
      })),
      sectionSeries: sectionSeries.map((row) => ({
        minute: row.bucket,
        label: row.label,
        avgDurationMs: row.avg_duration_ms,
        count: row.count,
      })),
      pageVisits: visitRows,
      countryVisits: countryRows.map((row) => ({
        countryCode: row.name || 'UNKNOWN',
        count: row.count,
      })),
      osVisits: osRows.map((row) => ({
        osName: row.name || 'Unknown',
        count: row.count,
      })),
      browserVisits: browserRows.map((row) => ({
        browserName: row.name || 'Unknown',
        count: row.count,
      })),
      systemSeries: systemRows.map((row) => ({
        at: toIsoString(row.created_at),
        cpuPercent: row.cpu_percent,
        memoryPercent: row.memory_percent,
        rssMb: row.rss_mb,
        heapUsedMb: row.heap_used_mb,
        totalMemMb: row.total_mem_mb,
      })),
      slowRequests: slowRows.map((row) => ({
        ...row,
        created_at: toIsoString(row.created_at),
      })),
      apiStats: apiRows.map((row) => {
        const avg = row.avg_duration_ms ?? 0;
        const level: 'low' | 'near' | 'high' =
          avg >= 800 ? 'high' : avg >= 300 ? 'near' : 'low';
        return {
          path: row.path,
          method: row.method,
          requestCount: row.request_count,
          avgDurationMs: avg,
          level,
          levelLabel: level,
        };
      }),
      probeStats: probeRows.map((row) => ({
        apiKey: row.api_key,
        path: row.path,
        method: row.method,
        cacheType: row.cache_type,
        requestCount: row.request_count,
        avgDurationMs: row.avg_duration_ms ?? 0,
        maxDurationMs: row.max_duration_ms ?? 0,
        lastDurationMs: Number(row.last_duration_ms ?? 0),
        lastStatusCode: Number(row.last_status_code ?? 0),
        lastSuccess: Number(row.last_success ?? 0) === 1,
      })),
      siteClicks: siteClickRows.map((row) => ({
        siteName: row.site_name,
        siteHref: row.site_href,
        siteCategory: row.site_category,
        clickCount: row.click_count,
      })),
    };
  }

  private percentileFromSorted(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.ceil(values.length * p) - 1),
    );
    return values[index] ?? 0;
  }

  private async ensureTables() {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS apm_page_visits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        path VARCHAR(255) NOT NULL,
        device_type ENUM('mobile','desktop','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
        user_agent VARCHAR(500) NOT NULL,
        referrer VARCHAR(500) NULL,
        country_code VARCHAR(8) NOT NULL DEFAULT 'UNKNOWN',
        os_name VARCHAR(64) NOT NULL DEFAULT 'Unknown',
        browser_name VARCHAR(64) NOT NULL DEFAULT 'Unknown',
        visits INT NOT NULL DEFAULT 1,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_page_device_country_os_browser (path, device_type, country_code, os_name, browser_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.addColumnIfMissing(
      'apm_page_visits',
      'country_code',
      "country_code VARCHAR(8) NOT NULL DEFAULT 'UNKNOWN'",
    );
    await this.addColumnIfMissing(
      'apm_page_visits',
      'os_name',
      "os_name VARCHAR(64) NOT NULL DEFAULT 'Unknown'",
    );
    await this.addColumnIfMissing(
      'apm_page_visits',
      'browser_name',
      "browser_name VARCHAR(64) NOT NULL DEFAULT 'Unknown'",
    );
    try {
      await this.pool.execute(
        `ALTER TABLE apm_page_visits DROP INDEX uk_page_device`,
      );
    } catch {
      // old index may not exist
    }
    try {
      await this.pool.execute(
        `ALTER TABLE apm_page_visits DROP INDEX uk_page_device_country_os`,
      );
    } catch {
      // transitional index may not exist
    }
    try {
      await this.pool.execute(`
        ALTER TABLE apm_page_visits
        ADD UNIQUE KEY uk_page_device_country_os_browser (path, device_type, country_code, os_name, browser_name)
      `);
    } catch {
      // new index may already exist
    }

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS apm_request_timings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        scope ENUM('route','section') NOT NULL,
        name VARCHAR(100) NOT NULL,
        path VARCHAR(255) NULL,
        method VARCHAR(10) NULL,
        status_code INT NULL,
        duration_ms INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_created_at (created_at),
        INDEX idx_scope_name (scope, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS apm_system_metrics (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        cpu_percent DECIMAL(5,1) NOT NULL,
        memory_percent DECIMAL(5,1) NOT NULL,
        rss_mb INT NOT NULL,
        heap_used_mb INT NOT NULL,
        total_mem_mb INT NOT NULL,
        load_avg_1m DECIMAL(10,2) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_api_probes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        api_key VARCHAR(100) NOT NULL,
        path VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        cache_type ENUM('redis','no-cache') NOT NULL DEFAULT 'no-cache',
        status_code INT NOT NULL,
        duration_ms INT NOT NULL,
        is_success TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_created_at (created_at),
        INDEX idx_api_key (api_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS apm_site_clicks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        site_name VARCHAR(255) NOT NULL,
        site_href VARCHAR(500) NOT NULL,
        site_category VARCHAR(100) NOT NULL DEFAULT 'unknown',
        device_type ENUM('mobile','desktop','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_created_at (created_at),
        INDEX idx_site_href (site_href)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS apm_youtube_clicks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        video_id VARCHAR(100) NOT NULL,
        video_title VARCHAR(500) NOT NULL DEFAULT '',
        channel_title VARCHAR(255) NOT NULL DEFAULT '',
        device_type ENUM('mobile','desktop','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_created_at (created_at),
        INDEX idx_video_id (video_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  }

  private async addColumnIfMissing(
    tableName: string,
    columnName: string,
    columnDefinition: string,
  ) {
    const [rows] = await this.pool.execute<ColumnExistsRow[]>(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
      `,
      [tableName, columnName],
    );

    if ((rows[0]?.count ?? 0) > 0) return;

    await this.pool.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`,
    );
  }

  private async deleteMetricRowsOlderThan(
    tableName:
      | 'apm_system_metrics'
      | 'apm_request_timings'
      | 'monitoring_api_probes',
  ) {
    const chunkSize = 5000;
    let totalDeleted = 0;

    while (true) {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `DELETE FROM ${tableName}
         WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ${chunkSize}`,
        [this.METRIC_RETENTION_DAYS],
      );

      totalDeleted += result.affectedRows;
      if (result.affectedRows < chunkSize) break;
    }

    return totalDeleted;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function toIsoString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
