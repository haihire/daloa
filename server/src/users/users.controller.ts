import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('search')
  async search(@Body('characterName') characterName: string) {
    if (
      !characterName ||
      typeof characterName !== 'string' ||
      !characterName.trim()
    ) {
      throw new BadRequestException('characterName이 필요합니다.');
    }
    return this.usersService.searchAndUpsert(characterName.trim());
  }

  @Get('exists/:name')
  async exists(@Param('name') name: string) {
    const found = await this.usersService.existsByName(name);
    return { exists: found };
  }

  @Get('needs-cp/:name')
  async needsCp(@Param('name') name: string) {
    const needed = await this.usersService.needsCombatPower(name);
    return { needsUpdate: needed };
  }

  @Get('stats')
  async stats() {
    return this.usersService.getStats();
  }
}
