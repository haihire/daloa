import { Module } from '@nestjs/common';
import { AdminCacheController } from './admin-cache.controller';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminCacheController],
})
export class AdminCacheModule {}
