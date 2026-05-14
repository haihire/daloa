import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

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
