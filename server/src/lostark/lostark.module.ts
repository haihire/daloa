import { Module } from '@nestjs/common';
import { LostarkService } from './lostark.service';
import { LostarkController } from './lostark.controller';

@Module({
  controllers: [LostarkController],
  providers: [LostarkService],
  exports: [LostarkService],
})
export class LostarkModule {}
