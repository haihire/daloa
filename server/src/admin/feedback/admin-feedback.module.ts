import { Module } from '@nestjs/common';
import { AdminFeedbackController } from './admin-feedback.controller';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { FeedbackModule } from '../../feedback/feedback.module';

@Module({
  imports: [AdminAuthModule, FeedbackModule],
  controllers: [AdminFeedbackController],
})
export class AdminFeedbackModule {}
