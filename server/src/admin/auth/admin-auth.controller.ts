import {
  Controller,
  Post,
  Get,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin.guard';

@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @UseGuards(AdminGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  me() {
    return { ok: true };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { username?: string; password?: string }) {
    if (!body.username || !body.password) {
      throw new BadRequestException('username과 password는 필수입니다');
    }
    return this.authService.login(body.username, body.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('x-admin-session') sessionId: string) {
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
    return { ok: true };
  }
}
