import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FeedbackRepository } from '../feedback/feedback.repository';
import { AdminGuard, AdminWriteGuard } from './admin.guard';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Controller('api/admin/feedback')
@UseGuards(AdminGuard)
export class AdminFeedbackController {
  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  @Get()
  async list(@Query('page') page?: string, @Query('size') size?: string) {
    const pageNum = clampInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(size, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const { items, total } = await this.feedbackRepo.findPage(
      pageSize,
      (pageNum - 1) * pageSize,
    );
    return { items, total, page: pageNum, size: pageSize };
  }

  @Delete(':id')
  @UseGuards(AdminWriteGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const found = await this.feedbackRepo.exists(id);
    if (!found) throw new NotFoundException('Feedback not found');

    await this.feedbackRepo.delete(id);
    return { ok: true };
  }
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
