import { Controller, Get, Header } from '@nestjs/common';
import { SitesService } from './sites.service';

@Controller('api/sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @Header('Cache-Control', 'public, s-maxage=1000, stale-while-revalidate=60')
  findAll() {
    return this.sitesService.findAll();
  }
}
