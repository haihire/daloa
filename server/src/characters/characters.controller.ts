import { Controller, Get, Header } from '@nestjs/common';
import { CharactersService } from './characters.service';

@Controller('api/characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get('stat-builds')
  @Header('Cache-Control', 'public, s-maxage=1000, stale-while-revalidate=60')
  findStatBuilds() {
    return this.charactersService.findStatBuilds();
  }
}
