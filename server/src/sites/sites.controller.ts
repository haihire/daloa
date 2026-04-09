import { Controller, Get } from '@nestjs/common';
import { SitesService } from './sites.service';

@Controller('api/sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  findAll() {
    return this.sitesService.findAll();
  }
}
