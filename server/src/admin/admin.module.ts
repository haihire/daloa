import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSitesController } from './admin-sites.controller';
import { AdminCacheController } from './admin-cache.controller';
import { AdminCharactersController } from './admin-characters.controller';
import { AdminSyncController } from './admin-sync.controller';
import { AdminGuard, AdminWriteGuard } from './admin.guard';
import { StreamersModule } from '../streamers/streamers.module';

@Module({
  imports: [StreamersModule],
  controllers: [
    AdminAuthController,
    AdminSitesController,
    AdminCacheController,
    AdminCharactersController,
    AdminSyncController,
  ],
  providers: [AdminAuthService, AdminGuard, AdminWriteGuard],
  exports: [AdminAuthService],
})
export class AdminModule {}
