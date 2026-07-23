import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  AdminAuthService,
  AdminRole,
  AdminSessionPayload,
} from './admin-auth.service';

export const REQUIRE_OWNER = 'requireOwner';

/** @RequireOwner() — owner 전용 엔드포인트에 붙이는 데코레이터 */
export const RequireOwner = () =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  (Reflect as any).metadata(REQUIRE_OWNER, true);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const sessionId = req.headers['x-admin-session'] as string | undefined;

    if (!sessionId) {
      throw new UnauthorizedException('세션이 없습니다');
    }

    const payload = await this.authService.verifySession(sessionId);
    if (!payload) {
      throw new UnauthorizedException('유효하지 않은 세션입니다');
    }

    // owner 전용 엔드포인트 체크
    const requireOwner = this.reflector.get<boolean>(
      REQUIRE_OWNER,
      context.getHandler(),
    );
    if (requireOwner && payload.role !== 'master') {
      throw new ForbiddenException('소유자 권한이 필요합니다');
    }

    // 요청 객체에 사용자 정보 주입
    (req as Request & { adminUser: AdminSessionPayload }).adminUser = payload;
    return true;
  }
}

/** 데모 계정의 쓰기 요청을 차단하는 가드 */
@Injectable()
export class AdminWriteGuard implements CanActivate {
  constructor(private readonly authService: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const sessionId = req.headers['x-admin-session'] as string | undefined;

    if (!sessionId) {
      throw new UnauthorizedException('세션이 없습니다');
    }

    const payload = await this.authService.verifySession(sessionId);
    if (!payload) {
      throw new UnauthorizedException('유효하지 않은 세션입니다');
    }

    const role: AdminRole = payload.role;
    if (role === 'guest') {
      throw new ForbiddenException('게스트 계정은 읽기 전용입니다');
    }

    (req as Request & { adminUser: AdminSessionPayload }).adminUser = payload;
    return true;
  }
}
