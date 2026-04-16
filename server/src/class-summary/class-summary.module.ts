import { Module } from '@nestjs/common';
import { ClassSummaryController } from './class-summary.controller';
import { ClassSummaryService } from './class-summary.service';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [ClassSummaryController],
  providers: [ClassSummaryService],
})
export class ClassSummaryModule {}
