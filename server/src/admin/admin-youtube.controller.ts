import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { StreamersService } from '../streamers/streamers.service';
import { AdminWriteGuard } from './admin.guard';

@Controller('api/admin/youtube')
@UseGuards(AdminWriteGuard)
export class AdminYoutubeController {
  constructor(private readonly streamers: StreamersService) {}

  /** 인기 영상 목록에서 특정 영상을 숨김(삭제) 처리 */
  @Post('block')
  async block(@Body() body: { videoId?: string }) {
    if (!body.videoId) throw new BadRequestException('videoId는 필수입니다');
    try {
      await this.streamers.blockVideo(body.videoId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return { ok: true, videoId: body.videoId };
  }

  /** 숨김 해제(복원) */
  @Post('unblock')
  async unblock(@Body() body: { videoId?: string }) {
    if (!body.videoId) throw new BadRequestException('videoId는 필수입니다');
    try {
      await this.streamers.unblockVideo(body.videoId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return { ok: true, videoId: body.videoId };
  }

  /** 현재 숨김 처리된 videoId 목록 */
  @Get('blocked')
  async blocked() {
    return { items: await this.streamers.listBlocked() };
  }
}
