import { Controller, Get } from '@nestjs/common';
import { CharactersService } from './characters.service';

@Controller('api/characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get('stat-builds')
  findStatBuilds() {
    return this.charactersService.findStatBuilds();
  }
}
