import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from './admin.guard';
import { AdminMonitoringService } from './admin-monitoring.service';
import { DockerStatsService } from './docker-stats.service';
import { AiDiagnosisService, type ChatMessage } from './ai-diagnosis.service';

@Controller('api')
export class AdminMonitoringController {
  private readonly telemetryToken = process.env.TELEMETRY_INGEST_TOKEN ?? '';
  private readonly telemetryWindowMs = 60_000;
  private readonly telemetryMaxPerWindow = 12_000;
  private telemetryWindowStartedAt = Date.now();
  private telemetryWindowCount = 0;

  constructor(
    private readonly monitoring: AdminMonitoringService,
    private readonly dockerStats: DockerStatsService,
    private readonly aiDiagnosis: AiDiagnosisService,
  ) {}

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/dashboard')
  dashboard(@Query('days') days?: string, @Query('pvDays') pvDays?: string) {
    const parsed = Number(days);
    const rangeDays = Number.isFinite(parsed)
      ? Math.max(1, Math.min(30, Math.trunc(parsed)))
      : 7;
    const parsedPv = Number(pvDays);
    const pageVisitDays = Number.isFinite(parsedPv)
      ? Math.max(1, Math.min(30, Math.trunc(parsedPv)))
      : 14;
    return this.monitoring.getDashboard(rangeDays, pageVisitDays);
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/containers')
  async containers() {
    const [containers, host, statuses] = await Promise.all([
      this.dockerStats.getContainerStats(),
      this.dockerStats.getHostStats(),
      this.dockerStats.getContainerStatuses(),
    ]);
    return { containers, host, statuses };
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/container-history')
  containerHistory(@Query('container') container?: string) {
    return this.dockerStats.getContainerHistory(container ?? 'nest');
  }

  // 배포 이벤트 기록(GitHub Actions가 호출). 관리자 세션 대신 공유 토큰으로 인증.
  // nest: 배포 워크플로에서, next: Vercel 배포 성공 시 deployment_status 워크플로에서 POST.
  @Post('webhooks/deploy')
  @HttpCode(HttpStatus.OK)
  async deployEvent(
    @Headers('x-deploy-token') token: string | undefined,
    @Body() body: { service?: string; sha?: string; detail?: string },
  ) {
    const expected = process.env.DEPLOY_EVENT_TOKEN ?? '';
    if (!expected || token !== expected) {
      throw new ForbiddenException('invalid deploy token');
    }
    if (body?.service !== 'nest' && body?.service !== 'next') {
      return { ok: false };
    }
    await this.monitoring.recordDeployEvent({
      service: body.service,
      sha: body.sha,
      detail: body.detail,
    });
    return { ok: true };
  }

  // 버튼 클릭 시 1회만 호출(비용 통제). 컨테이너 메트릭+EC2 정보를 LLM에 보내 진단.
  @UseGuards(AdminGuard)
  @Get('admin/monitoring/ai-diagnosis')
  getAiDiagnosis() {
    return this.aiDiagnosis.diagnose();
  }

  // 운영 챗봇. 운영 데이터는 모든 관리자(guest 포함)가 동일하게 조회 가능.
  // 민감정보(계정/시크릿/토큰/env)는 애초에 컨텍스트에 없어 누구도 못 봄.
  @UseGuards(AdminGuard)
  @Post('admin/monitoring/ai-chat')
  aiChat(@Body() body: { messages?: ChatMessage[] }) {
    return this.aiDiagnosis.chat(body?.messages ?? []);
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/page-load-series')
  pageLoadSeries(@Query('days') days?: string) {
    const parsed = Number(days);
    const rangeDays = Number.isFinite(parsed) ? parsed : 7;
    return this.monitoring.getPageLoadSeries(rangeDays);
  }

  @Post('telemetry/page-load')
  pageLoad(
    @Req() req: Request,
    @Headers('x-telemetry-token') token: string | undefined,
    @Body()
    body: {
      path?: string;
      deviceType?: string;
      ttfb?: number;
      dcl?: number;
      lcp?: number;
      load?: number;
    },
  ) {
    this.assertTelemetryAllowed(req, token);
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    // load(또는 최소 ttfb)가 없으면 의미 없는 비콘 — 무시
    if (num(body.load) === null && num(body.ttfb) === null) {
      return { ok: false };
    }
    return this.monitoring.recordPageLoad({
      path: typeof body.path === 'string' ? body.path : '/',
      deviceType:
        typeof body.deviceType === 'string' ? body.deviceType : 'unknown',
      ttfb: num(body.ttfb),
      dcl: num(body.dcl),
      lcp: num(body.lcp),
      load: num(body.load),
    });
  }

  @Post('telemetry/page-visit')
  pageVisit(
    @Req() req: Request,
    @Headers('x-telemetry-token') token: string | undefined,
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
    this.assertTelemetryAllowed(req, token);
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
    @Req() req: Request,
    @Headers('x-telemetry-token') token: string | undefined,
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
    this.assertTelemetryAllowed(req, token);
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
    @Req() req: Request,
    @Headers('x-telemetry-token') token: string | undefined,
    @Body()
    body: {
      siteName?: string;
      siteHref?: string;
      siteCategory?: string;
      deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';
    },
  ) {
    this.assertTelemetryAllowed(req, token);
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
    @Req() req: Request,
    @Headers('x-telemetry-token') token: string | undefined,
    @Body()
    body: {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';
    },
  ) {
    this.assertTelemetryAllowed(req, token);
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

  private assertTelemetryAllowed(req: Request, token: string | undefined) {
    if (this.telemetryToken) {
      if (!token || token !== this.telemetryToken) {
        throw new ForbiddenException('invalid telemetry token');
      }
      this.consumeTelemetryBudget();
      return;
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!origin && !referer) {
      throw new ForbiddenException('telemetry origin missing');
    }
    this.consumeTelemetryBudget();
  }

  private consumeTelemetryBudget() {
    const now = Date.now();
    if (now - this.telemetryWindowStartedAt >= this.telemetryWindowMs) {
      this.telemetryWindowStartedAt = now;
      this.telemetryWindowCount = 0;
    }

    this.telemetryWindowCount += 1;
    if (this.telemetryWindowCount > this.telemetryMaxPerWindow) {
      throw new HttpException(
        'telemetry rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
