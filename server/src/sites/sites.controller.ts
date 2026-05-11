import { Controller, Get, Header } from '@nestjs/common';
import { SitesService } from './sites.service';

@Controller('api/sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @Header('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600')
  findAll() {
    return this.sitesService.findAll();
  }
}
