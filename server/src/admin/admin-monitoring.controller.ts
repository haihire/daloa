import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminMonitoringService } from './admin-monitoring.service';

@Controller('api')
export class AdminMonitoringController {
  constructor(private readonly monitoring: AdminMonitoringService) {}

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/dashboard')
  dashboard(@Query('days') days?: string) {
    const parsed = Number(days);
    const rangeDays = Number.isFinite(parsed) ? Math.max(1, Math.min(30, Math.trunc(parsed))) : 7;
    return this.monitoring.getDashboard(rangeDays);
  }

  @Get('admin/monitoring/system/current')
  currentSystem() {
    const current = this.monitoring.getCurrentSystemSnapshot();
    return {
      created_at: current.at,
      cpu_percent: current.cpuPercent,
      memory_percent: current.memoryPercent,
      rss_mb: current.rssMb,
      heap_used_mb: current.heapUsedMb,
      heap_total_mb: current.heapTotalMb,
      total_mem_mb: current.totalMemMb,
      load_avg_1m: current.loadAvg1m,
    };
  }

  @Post('telemetry/page-visit')
  pageVisit(
    @Body()
    body: {
      path?: string;
      deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';
      userAgent?: string;
      referrer?: string | null;
      countryCode?: string;
      osName?: string;
      browserName?: string;
    },
  ) {
    return this.monitoring.recordPageVisit({
      path: body.path ?? '/',
      deviceType: body.deviceType ?? 'unknown',
      userAgent: body.userAgent ?? '',
      referrer: body.referrer ?? null,
      countryCode: body.countryCode ?? 'UNKNOWN',
      osName: body.osName ?? 'Unknown',
      browserName: body.browserName ?? 'Unknown',
    });
  }

  @Post('telemetry/request')
  request(
    @Body()
    body: {
      scope?: 'route' | 'section';
      name?: string;
      path?: string;
      method?: string;
      statusCode?: number;
      durationMs?: number;
    },
  ) {
    if (!body.name || typeof body.durationMs !== 'number') {
      return { ok: false };
    }
    return this.monitoring.recordRequest({
      scope: body.scope ?? 'route',
      name: body.name,
      path: body.path,
      method: body.method,
      statusCode: body.statusCode,
      durationMs: body.durationMs,
    });
  }

  @Post('telemetry/site-click')
  siteClick(
    @Body()
    body: {
      siteName?: string;
      siteHref?: string;
      siteCategory?: string;
      deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';
    },
  ) {
    if (!body.siteHref) {
      return { ok: false };
    }
    return this.monitoring.recordSiteClick({
      siteName: body.siteName ?? body.siteHref,
      siteHref: body.siteHref,
      siteCategory: body.siteCategory ?? 'unknown',
      deviceType: body.deviceType ?? 'unknown',
    });
  }

  @Post('telemetry/youtube-click')
  youtubeClick(
    @Body()
    body: {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';
    },
  ) {
    if (!body.videoId) {
      return { ok: false };
    }
    return this.monitoring.recordYoutubeClick({
      videoId: body.videoId,
      videoTitle: body.videoTitle ?? '',
      channelTitle: body.channelTitle ?? '',
      deviceType: body.deviceType ?? 'unknown',
    });
  }
}
