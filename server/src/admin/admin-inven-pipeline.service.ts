import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { AdminInvenRepository } from './repositories/admin-inven.repository';
import {
  SiteExtractorService,
  type CrawledPost,
} from './site-extractor.service';

const execFileAsync = promisify(execFile);

// Docker: SITE_FINDER_DIR=/site-finder (볼륨)
// 로컬: nest는 server/ 에서 실행되므로 프로젝트 루트(server의 상위)의 site-finder
const SITE_FINDER_DIR =
  process.env.SITE_FINDER_DIR ?? join(process.cwd(), '..', 'site-finder');

// Python 실행 명령. Windows는 'python', Linux/Docker(Alpine)는 'python3'.
// PYTHON_BIN 환경변수로 오버라이드 가능.
const PYTHON_BIN =
  process.env.PYTHON_BIN ??
  (process.platform === 'win32' ? 'python' : 'python3');

export interface PipelineStatus {
  running: boolean;
  step: string; // 현재 단계 이름
  stepIndex: number; // 0-based
  totalSteps: number;
  percent: number; // 0~100
  message: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  targetDate: string | null;
}

// 진행률 표시용 단계 정의 (실제 처리는 runPipeline에서)
const STEPS = [
  { key: 'crawl', label: '크롤링', weight: 70 },
  { key: 'save', label: 'DB 저장', weight: 15 },
  { key: 'extract', label: '사이트 추출', weight: 15 },
];
const TOTAL_WEIGHT = STEPS.reduce((s, t) => s + t.weight, 0);

@Injectable()
export class AdminInvenPipelineService {
  private readonly logger = new Logger(AdminInvenPipelineService.name);

  constructor(
    private readonly invenRepo: AdminInvenRepository,
    private readonly extractor: SiteExtractorService,
  ) {}

  private state: PipelineStatus = {
    running: false,
    step: '',
    stepIndex: 0,
    totalSteps: STEPS.length,
    percent: 0,
    message: '대기 중',
    error: null,
    startedAt: null,
    finishedAt: null,
    targetDate: null,
  };

  getStatus(): PipelineStatus {
    return { ...this.state };
  }

  /** 파이프라인을 비동기로 시작한다(백그라운드). 이미 실행 중이면 무시. */
  run(targetDate?: string): { started: boolean; reason?: string } {
    if (this.state.running) {
      return { started: false, reason: '이미 실행 중입니다' };
    }

    // targetDate 지정 → 날짜 백필(수동), 없으면 → 증분(post_id 기준) 모드(스케줄)
    const date = targetDate ?? null;

    this.state = {
      running: true,
      step: '',
      stepIndex: 0,
      totalSteps: STEPS.length,
      percent: 0,
      message: date
        ? `파이프라인 시작 (날짜 ${date})`
        : '파이프라인 시작 (증분)',
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      targetDate: date,
    };

    // 백그라운드 실행 (await 하지 않음)
    this.runPipeline(date).catch((e) => {
      this.logger.error('파이프라인 오류:', e);
    });

    return { started: true };
  }

  private setStep(index: number, message: string) {
    this.state.stepIndex = index;
    this.state.step = STEPS[index].key;
    this.state.message = message;
    const done = STEPS.slice(0, index).reduce((s, t) => s + t.weight, 0);
    this.state.percent = Math.round((done / TOTAL_WEIGHT) * 100);
  }

  private async runPipeline(date: string | null): Promise<void> {
    const label = date ?? '증분';
    try {
      // 1) 크롤링 (Python — stdout JSON 수신, DB 미접근)
      this.setStep(0, '크롤링 진행 중...');
      this.logger.log(`[크롤링] 시작 (${label})`);
      const posts = await this.crawl(date);
      this.logger.log(`[크롤링] 완료 — 게시글 ${posts.length}개`);

      // 2) DB 저장 (Nest — Prisma upsert)
      this.setStep(1, 'DB 저장 진행 중...');
      const savedCount = await this.invenRepo.upsertPosts(posts);
      this.logger.log(`[DB 저장] 완료 — ${savedCount}개`);

      // 3) 사이트 추출 (Nest — URL 추출 + 필터 + 후보 저장)
      this.setStep(2, '사이트 추출 진행 중...');
      const [hrefs, blacklist] = await Promise.all([
        this.invenRepo.getRegisteredHrefs(),
        this.invenRepo.getBlacklistDomains(),
      ]);
      const existing = this.buildExistingDomainSet(hrefs);
      const drafts = this.extractor.extract(posts, existing, blacklist);
      const candCount = await this.invenRepo.upsertCandidates(drafts);
      this.logger.log(`[사이트 추출] 완료 — 후보 ${candCount}개`);

      this.state.running = false;
      this.state.step = 'done';
      this.state.percent = 100;
      this.state.message = `완료 (${label}) — 게시글 ${savedCount}개, 추천 후보 ${candCount}개`;
      this.state.finishedAt = new Date().toISOString();
      this.logger.log(`파이프라인 완료 (${label})`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      this.state.running = false;
      this.state.step = 'error';
      this.state.error = msg;
      this.state.message = `실패: ${msg}`;
      this.state.finishedAt = new Date().toISOString();
      this.logger.error(`파이프라인 실패: ${msg}`);
    }
  }

  /**
   * crawl.py 실행 → stdout JSON 파싱 → 게시글 배열 반환.
   * date 지정 시 날짜 백필, 없으면 게시판별 최신 post_id 이후만 증분 크롤.
   */
  private async crawl(date: string | null): Promise<CrawledPost[]> {
    const scriptPath = join(SITE_FINDER_DIR, 'crawl.py');
    const args = [scriptPath];
    if (date) {
      args.push('--date', date);
    } else {
      const maxIds = await this.invenRepo.getMaxPostIdByBoard();
      args.push('--since-free', String(maxIds.free ?? 0));
      args.push('--since-tip', String(maxIds.tip ?? 0));
      this.logger.log(
        `[크롤링] 증분 기준 since free=${maxIds.free ?? 0} tip=${maxIds.tip ?? 0}`,
      );
    }
    const { stdout } = await execFileAsync(PYTHON_BIN, args, {
      timeout: 60 * 60 * 1000, // 최대 1시간
      maxBuffer: 256 * 1024 * 1024, // 256MB (수천 게시글 JSON 대비)
      env: { ...process.env },
    });
    const parsed = JSON.parse(stdout) as {
      target_date: string;
      posts: CrawledPost[];
    };
    return parsed.posts ?? [];
  }

  /** href 목록 → 도메인 + 루트 도메인 집합 */
  private buildExistingDomainSet(hrefs: string[]): Set<string> {
    const set = new Set<string>();
    for (const href of hrefs) {
      const d = this.extractor.normalizeDomain(href);
      if (d) {
        set.add(d);
        set.add(this.extractor.rootDomain(d));
      }
    }
    return set;
  }
}
