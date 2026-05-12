import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AdminAuthService, AdminRole } from './admin-auth.service';

export const REQUIRE_OWNER = 'requireOwner';

/** @RequireOwner() — owner 전용 엔드포인트에 붙이는 데코레이터 */
export const RequireOwner = () =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  (Reflect as any).metadata(REQUIRE_OWNER, true);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('인증 토큰이 없습니다');
    }

    const token = authHeader.slice(7);
    let payload: ReturnType<AdminAuthService['verifyToken']>;
    try {
      payload = this.authService.verifyToken(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
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
    (req as any).adminUser = payload;
    return true;
  }
}

/** 데모 계정의 쓰기 요청을 차단하는 가드 */
@Injectable()
export class AdminWriteGuard implements CanActivate {
  constructor(private readonly authService: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('인증 토큰이 없습니다');
    }

    const token = authHeader.slice(7);
    let payload: ReturnType<AdminAuthService['verifyToken']>;
    try {
      payload = this.authService.verifyToken(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    if (payload.role !== 'master') {
      const role = payload.role as AdminRole;
      if (role === 'guest') {
        throw new ForbiddenException('게스트 계정은 읽기 전용입니다');
      }
    }

    (req as any).adminUser = payload;
    return true;
  }
}
