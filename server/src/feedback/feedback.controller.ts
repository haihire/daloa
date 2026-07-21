import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FeedbackService } from './feedback.service';

@Controller('api/feedback')
export class FeedbackController {
  // Next 라우트 핸들러(/api/feedback)가 붙여주는 인제스트 토큰. 텔레메트리와 같은
  // 신뢰 경계(Next 서버 → Nest)라 토큰을 공유한다. 미설정 환경(로컬)은 origin/referer로 대체.
  private readonly ingestToken = process.env.TELEMETRY_INGEST_TOKEN ?? '';

  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Headers('x-telemetry-token') token: string | undefined,
    @Body() body: { message?: string; path?: string; deviceType?: string },
  ) {
    this.assertAllowed(req, token);
    return this.feedback.submit({
      message: body?.message,
      path: body?.path,
      deviceType: body?.deviceType,
      clientIp: readClientIp(req),
    });
  }

  private assertAllowed(req: Request, token: string | undefined) {
    if (this.ingestToken) {
      if (!token || token !== this.ingestToken) {
        throw new ForbiddenException('invalid feedback token');
      }
      return;
    }

    if (!req.headers.origin && !req.headers.referer) {
      throw new ForbiddenException('feedback origin missing');
    }
  }
}

/** nginx/Next가 넘긴 X-Forwarded-For의 첫 항목이 실제 클라이언트 IP. */
function readClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}
