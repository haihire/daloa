import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, AdminWriteGuard } from '../auth/admin.guard';
import { AdminInvenRepository } from './admin-inven.repository';
import { AdminInvenPipelineService } from './admin-inven-pipeline.service';
import { SiteSuggestService } from './site-suggest.service';
import { SitesRepository } from '../../sites/sites.repository';
import { SitesService } from '../../sites/sites.service';

@Controller('api/admin/inven')
@UseGuards(AdminGuard)
export class AdminInvenController {
  constructor(
    private readonly invenRepo: AdminInvenRepository,
    private readonly pipeline: AdminInvenPipelineService,
    private readonly suggestService: SiteSuggestService,
    private readonly sitesRepo: SitesRepository,
    private readonly sitesService: SitesService,
  ) {}

  /** 파이프라인 수동 실행 (크롤 → DB → 사이트 추천). master 전용. */
  @Post('pipeline/run')
  @UseGuards(AdminWriteGuard)
  runPipeline(@Body('date') date?: string) {
    return this.pipeline.run(date);
  }

  /** 파이프라인 현재 상태 조회 (폴링용) */
  @Get('pipeline/status')
  getPipelineStatus() {
    return this.pipeline.getStatus();
  }

  /** 추출된 사이트 후보 목록 (검토 대기 / 추가됨 / 거부됨). */
  @Get('site-candidates')
  async getSiteCandidates(@Query('status') status = 'pending') {
    const candidates = await this.invenRepo.getSiteCandidates(status);
    return { candidates };
  }

  /** 추천 후보를 실제 사이트 목록(loa_sites)에 추가하고 상태를 added로 변경. */
  @Post('site-candidates/:id/approve')
  @UseGuards(AdminWriteGuard)
  async approveCandidate(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      href?: string;
      category?: string;
      description?: string;
      icon?: string;
    },
  ) {
    const cand = await this.invenRepo.getSiteCandidateById(id);
    if (!cand) throw new NotFoundException('후보를 찾을 수 없습니다');

    const name = body.name?.trim() || cand.name || cand.domain;
    const href = body.href?.trim() || `https://${cand.domain}`;
    const seq = await this.sitesRepo.create({
      name,
      href,
      category: body.category?.trim() || cand.category || null,
      description: body.description?.trim() || cand.description || null,
      icon: body.icon?.trim() || null,
    });
    await this.invenRepo.updateCandidateStatus(id, 'added');
    await this.sitesService.invalidateCache();
    return { seq, href };
  }

  /**
   * 추천 후보를 거부(rejected) 처리하고 도메인을 블랙리스트에 추가한다.
   * 다음 크롤부터 해당 도메인은 후보로 뜨지 않는다.
   */
  @Post('site-candidates/:id/reject')
  @UseGuards(AdminWriteGuard)
  async rejectCandidate(@Param('id', ParseIntPipe) id: number) {
    const cand = await this.invenRepo.getSiteCandidateById(id);
    if (!cand) throw new NotFoundException('후보를 찾을 수 없습니다');
    await this.invenRepo.updateCandidateStatus(id, 'rejected');
    await this.invenRepo.addToBlacklist(cand.domain, '관리자 거부');
    return { ok: true };
  }

  /** 모달 열 때 자동 채울 사이트 name·icon 반환. AI 호출 없음. */
  @Get('site-candidates/:id/icon')
  async getCandidateIcon(@Param('id', ParseIntPipe) id: number) {
    const cand = await this.invenRepo.getSiteCandidateById(id);
    if (!cand) throw new NotFoundException('후보를 찾을 수 없습니다');
    return this.suggestService.fetchNameAndIcon({
      url: cand.url,
      domain: cand.domain,
    });
  }

  /**
   * 추천 후보에 대해 Gemini로 name/category/description/icon을 생성한다.
   * 버튼 클릭 시에만 호출됨(자동 실행 없음) — 토큰 보호. master 전용.
   */
  @Post('site-candidates/:id/suggest')
  @UseGuards(AdminWriteGuard)
  async suggestCandidate(@Param('id', ParseIntPipe) id: number) {
    const cand = await this.invenRepo.getSiteCandidateById(id);
    if (!cand) throw new NotFoundException('후보를 찾을 수 없습니다');
    return this.suggestService.suggest({ url: cand.url, domain: cand.domain });
  }

  /** 게시글 목록 (인기순) — 디버그/확인용 */
  @Get('posts')
  async getPosts(
    @Query('date') date?: string,
    @Query('board') board?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const posts = await this.invenRepo.getPosts({
      date,
      board,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return { posts };
  }
}
