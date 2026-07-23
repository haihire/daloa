import { Module } from '@nestjs/common';
import { AdminCharactersController } from './admin-characters.controller';
import { AdminCharactersRepository } from './admin-characters.repository';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminCharactersController],
  providers: [AdminCharactersRepository],
})
export class AdminCharactersModule {}
