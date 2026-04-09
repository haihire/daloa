import { Controller, Get } from '@nestjs/common';
import { LostarkService } from './lostark.service';

@Controller('api/lostark')
export class LostarkController {
  constructor(private readonly lostark: LostarkService) {}

  @Get('stats')
  getStats() {
    return this.lostark.getStats();
  }
}
