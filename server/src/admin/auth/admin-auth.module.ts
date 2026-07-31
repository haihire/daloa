import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminGuard, AdminWriteGuard } from './admin.guard';

@Module({
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    AdminAuthRepository,
    AdminGuard,
    AdminWriteGuard,
  ],
  exports: [AdminAuthService, AdminGuard, AdminWriteGuard],
})
export class AdminAuthModule {}
