import { Module } from '@nestjs/common';
import { AdminSitesController } from './admin-sites.controller';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { SitesModule } from '../../sites/sites.module';

@Module({
  imports: [AdminAuthModule, SitesModule],
  controllers: [AdminSitesController],
})
export class AdminSitesModule {}
