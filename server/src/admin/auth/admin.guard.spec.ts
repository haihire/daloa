import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { AdminGuard, RequireOwner, REQUIRE_OWNER } from './admin.guard';
import type { AdminAuthService } from './admin-auth.service';

/**
 * 회귀 방지: @RequireOwner()가 Reflector로 실제로 읽히는지 검증한다.
 *
 * 과거 이 데코레이터가 Reflect.metadata()로 구현돼 있어 메타데이터가
 * (프로토타입, 메서드명)에 붙었고, 가드는 핸들러 함수에서 읽어 항상 undefined였다.
 * 그 결과 guest가 owner 전용 엔드포인트를 그대로 통과했다.
 */
describe('RequireOwner 데코레이터', () => {
  class TestController {
    @RequireOwner()
    ownerOnly() {}

    anyone() {}
  }

  const reflector = new Reflector();

  it('데코레이터를 붙인 핸들러에서 메타데이터가 읽힌다', () => {
    expect(
      reflector.get<boolean>(REQUIRE_OWNER, TestController.prototype.ownerOnly),
    ).toBe(true);
  });

  it('안 붙인 핸들러에는 메타데이터가 없다', () => {
    expect(
      reflector.get<boolean>(REQUIRE_OWNER, TestController.prototype.anyone),
    ).toBeUndefined();
  });

  describe('AdminGuard 권한 검사', () => {
    const makeContext = (handler: () => void) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'x-admin-session': 'session-id' } }),
        }),
        getHandler: () => handler,
      }) as unknown as Parameters<AdminGuard['canActivate']>[0];

    const authServiceFor = (role: 'master' | 'guest') =>
      ({
        verifySession: () => Promise.resolve({ username: 'u', role }),
      }) as unknown as AdminAuthService;

    it('guest는 owner 전용 핸들러에서 차단된다', async () => {
      const guard = new AdminGuard(authServiceFor('guest'), reflector);
      await expect(
        guard.canActivate(makeContext(TestController.prototype.ownerOnly)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('master는 owner 전용 핸들러를 통과한다', async () => {
      const guard = new AdminGuard(authServiceFor('master'), reflector);
      await expect(
        guard.canActivate(makeContext(TestController.prototype.ownerOnly)),
      ).resolves.toBe(true);
    });

    it('guest도 일반 핸들러는 통과한다', async () => {
      const guard = new AdminGuard(authServiceFor('guest'), reflector);
      await expect(
        guard.canActivate(makeContext(TestController.prototype.anyone)),
      ).resolves.toBe(true);
    });
  });
});
