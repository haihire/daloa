import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { LostarkModule } from '../lostark/lostark.module';

@Module({
  imports: [LostarkModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
