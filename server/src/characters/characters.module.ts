import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
