import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminCacheModule } from './cache/admin-cache.module';

import { AdminSitesModule } from './sites/admin-sites.module';
import { AdminFeedbackModule } from './feedback/admin-feedback.module';
import { AdminMonitoringModule } from './monitoring/admin-monitoring.module';
import { AdminInvenModule } from './inven/admin-inven.module';

@Module({
  imports: [
    AdminAuthModule,
    AdminCacheModule,

    AdminSitesModule,
    AdminFeedbackModule,
    AdminMonitoringModule,
    AdminInvenModule,
  ],
  exports: [AdminAuthModule, AdminMonitoringModule],
})
export class AdminModule {}
