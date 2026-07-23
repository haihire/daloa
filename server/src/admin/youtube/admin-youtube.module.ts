import { Module } from '@nestjs/common';
import { AdminYoutubeController } from './admin-youtube.controller';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { StreamersModule } from '../../streamers/streamers.module';

@Module({
  imports: [AdminAuthModule, StreamersModule],
  controllers: [AdminYoutubeController],
})
export class AdminYoutubeModule {}
