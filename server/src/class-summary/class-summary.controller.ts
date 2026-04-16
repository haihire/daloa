import { Controller, Get, Param } from '@nestjs/common';
import { ClassSummaryService } from './class-summary.service';

@Controller('api/class-summary')
export class ClassSummaryController {
  constructor(private readonly classSummaryService: ClassSummaryService) {}

  @Get()
  findAll() {
    return this.classSummaryService.findAll();
  }

  @Get(':className')
  findOne(@Param('className') className: string) {
    return this.classSummaryService.findOne(className);
  }
}
