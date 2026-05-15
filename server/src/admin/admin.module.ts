import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSitesController } from './admin-sites.controller';
import { AdminCacheController } from './admin-cache.controller';
import { AdminCharactersController } from './admin-characters.controller';
import { AdminGuard, AdminWriteGuard } from './admin.guard';
import { StreamersModule } from '../streamers/streamers.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [StreamersModule, SitesModule],
  controllers: [
    AdminAuthController,
    AdminSitesController,
    AdminCacheController,
    AdminCharactersController,
  ],
  providers: [AdminAuthService, AdminGuard, AdminWriteGuard],
  exports: [AdminAuthService],
})
export class AdminModule {}
