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
import { AdminGuard, RequireOwner } from '../auth/admin.guard';
import { AdminMonitoringService } from './admin-monitoring.service';
import { DockerStatsService } from './docker-stats.service';
import { AiDiagnosisService, type ChatMessage } from './ai-diagnosis.service';
import { RagWriterService } from './rag/rag-writer.service';
import { RagRepository } from './rag/rag.repository';

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
    private readonly ragWriter: RagWriterService,
    private readonly ragRepo: RagRepository,
  ) {}

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/dashboard')
  dashboard(@Query('pvDays') pvDays?: string) {
    const parsedPv = Number(pvDays);
    const pageVisitDays = Number.isFinite(parsedPv)
      ? Math.max(1, Math.min(30, Math.trunc(parsedPv)))
      : 14;
    return this.monitoring.getDashboard(pageVisitDays);
  }

  // 최근 에러 로그 (401/404 제외 기록됨). status=all|4xx|5xx 로 필터.
  @UseGuards(AdminGuard)
  @Get('admin/monitoring/errors')
  errors(
    @Query('days') days?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const statusClass = status === '4xx' || status === '5xx' ? status : 'all';
    return this.monitoring.getRecentErrors({
      days: days ? Number(days) : undefined,
      status: statusClass,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/containers')
  async containers() {
    const [containers, host, statuses, breakdown] = await Promise.all([
      this.dockerStats.getContainerStats(),
      this.dockerStats.getHostStats(),
      this.dockerStats.getContainerStatuses(),
      this.dockerStats.getResourceBreakdown(),
    ]);
    // 상단 요약 카드의 호스트 CPU%는 자원 분해(breakdown)와 "같은 샘플"을 쓴다.
    // 각자 따로 재면 측정 창이 어긋나, 한 화면에 전체 1% / nest 80% 같은 모순된 값이 뜬다.
    return {
      containers,
      host:
        host && breakdown
          ? { ...host, cpuPercent: breakdown.hostCpuPercent }
          : host,
      statuses,
      breakdown,
    };
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/container-history')
  containerHistory(@Query('container') container?: string) {
    return this.dockerStats.getContainerHistory(container ?? 'nest');
  }

  // 자원 현황 상세의 추세. days=1|7(기본 7, 보관기간 9일까지) 또는 from/to=YYYY-MM-DD 구간.
  @UseGuards(AdminGuard)
  @Get('admin/monitoring/resource-breakdown-history')
  resourceBreakdownHistory(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dockerStats.getResourceBreakdownHistory({ days, from, to });
  }

  // 최근 배포/재시작 이력 (컨테이너 현황 페이지의 업데이트 내역 드롭다운용).
  @UseGuards(AdminGuard)
  @Get('admin/monitoring/deploy-events')
  deployEvents() {
    return this.monitoring.getRecentContainerEvents(14, 30);
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
  aiChat(@Body() body: { messages?: ChatMessage[] }, @Req() req: Request) {
    // AdminGuard가 심어둔 세션 정보 — 누가 물었는지 로그(rag_chat_logs)에 남기기 위함
    const admin = (req as Request & { adminUser?: { username: string } })
      .adminUser;
    return this.aiDiagnosis.chat(
      body?.messages ?? [],
      admin?.username ?? '알수없음',
    );
  }

  // RAG 지식베이스 문서 목록. 챗봇이 어떤 과거 기록을 참고할 수 있는지 확인용.
  @UseGuards(AdminGuard)
  @Get('admin/monitoring/rag/documents')
  ragDocuments() {
    return this.ragRepo.listDocuments(50);
  }

  // 운영 스냅샷 문서 생성(AI 호출 + 임베딩 = 비용 발생). owner 전용, 버튼 클릭 시 1회.
  // force=true면 같은 기간 문서가 있어도 새로 만든다.
  @UseGuards(AdminGuard)
  @RequireOwner()
  @Post('admin/monitoring/rag/snapshot')
  ragSnapshot(@Body() body: { force?: boolean }) {
    return this.ragWriter.generateWeeklySnapshot(body?.force === true);
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/page-load-series')
  pageLoadSeries(@Query('from') from?: string, @Query('to') to?: string) {
    return this.monitoring.getPageLoadSeries(from, to);
  }

  @UseGuards(AdminGuard)
  @Get('admin/monitoring/page-load-earliest')
  pageLoadEarliest() {
    return this.monitoring.getPageLoadEarliest();
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
