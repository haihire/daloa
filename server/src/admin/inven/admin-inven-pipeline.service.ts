import { Inject, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import type { Redis } from 'ioredis';
import { acquireLock, releaseLock } from '../../common/cron-lock.util';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { AdminInvenRepository } from './admin-inven.repository';
import {
  SiteExtractorService,
  type CrawledPost,
} from './site-extractor.service';

// PM2 cluster 다른 워커에서 실행 중인 파이프라인과 겹치지 않게 거는 락의 TTL.
// 크론 주기(2시간)보다 여유 있게 짧게 잡아, 워커가 죽어 releaseLock을 못 불러도
// 다음 크론 틱 전에는 자동으로 풀린다(최종 일관성).
const PIPELINE_LOCK_TTL_SEC = 60 * 90;

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

// 증분 1회 실행에서 본문(상세페이지)을 fetch할 최대 글 수. 목록 메타데이터는
// 캡과 무관하게 새 글 전체를 저장하므로 since_id는 매 런 gap 없이 전진한다.
//
// ⚠️ 캡에 걸려 스킵된 글은 content=null 로 저장되고 "영구히" 비어 있다.
//    crawl.py 의 본문 대상은 그 런에서 수집한 글로 한정되는데, 다음 런은 증분이라
//    이미 저장된 글을 다시 수집하지 않기 때문. 본문이 없으면 사이트 추출에서도 빠진다.
//    => 캡 × 하루 실행 횟수 >= 하루 신규 글 수 를 항상 만족시켜야 한다.
//
// 실측(2026-08 기준) 하루 신규 글: 1,200~3,800건.
// 크론이 새벽 4회(02~05시)라 4 × 1,200 = 4,800건 — 최대치에도 여유가 있다.
const INVEN_MAX_DETAIL = Number(process.env.INVEN_MAX_DETAIL ?? 1200);

// 댓글 수집 on/off. 링크는 본문보다 댓글에 훨씬 많이 달려서 사이트 추천의 주 재료다.
// 끄면 게시글당 요청이 2 → 1로 줄지만, 추천 후보도 같이 마른다.
// (본문과 동시에 요청하므로 켜도 런 시간은 거의 안 늘어난다)
const INVEN_COLLECT_COMMENTS = process.env.INVEN_COLLECT_COMMENTS !== '0';

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
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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

  /**
   * 파이프라인을 비동기로 시작한다(백그라운드). 이미 실행 중이면 무시.
   *
   * 크론(admin-inven-cron.service.ts)과 관리자의 수동 "지금 실행" 버튼이
   * 이 메서드를 공유한다 — this.state.running은 같은 프로세스 내 중복만 막으므로,
   * PM2 cluster 다른 워커에서 이미 실행 중인 경우까지 막으려면 Redis 락이 필요하다.
   */
  async run(
    targetDate?: string,
  ): Promise<{ started: boolean; reason?: string }> {
    if (this.state.running) {
      return { started: false, reason: '이미 실행 중입니다' };
    }

    const locked = await acquireLock(
      this.redis,
      'invenPipeline',
      PIPELINE_LOCK_TTL_SEC,
    );
    if (!locked) {
      return {
        started: false,
        reason: '다른 서버 인스턴스에서 이미 실행 중입니다',
      };
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

    // 백그라운드 실행 (await 하지 않음) — 성공/실패 무관하게 끝나면 락 반납.
    this.runPipeline(date)
      .catch((e) => {
        this.logger.error('파이프라인 오류:', e);
      })
      .finally(() => {
        releaseLock(this.redis, 'invenPipeline').catch(() => {});
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
      const comments = posts.reduce((s, p) => s + (p.comments?.length ?? 0), 0);
      this.logger.log(
        `[크롤링] 완료 — 게시글 ${posts.length}개, 댓글 ${comments}개`,
      );

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
    if (!INVEN_COLLECT_COMMENTS) args.push('--no-comments');
    if (date) {
      // 수동 날짜 백필: 본문 전체 수집(캡 해제)
      args.push('--date', date);
      args.push('--max-detail', '0');
    } else {
      const maxIds = await this.invenRepo.getMaxPostIdByBoard();
      args.push('--since-free', String(maxIds.free ?? 0));
      args.push('--since-tip', String(maxIds.tip ?? 0));
      // 증분: 본문 fetch는 캡으로 제한(목록 메타는 전체 저장 → since_id 정상 전진)
      args.push('--max-detail', String(INVEN_MAX_DETAIL));
      this.logger.log(
        `[크롤링] 증분 기준 since free=${maxIds.free ?? 0} tip=${maxIds.tip ?? 0} ` +
          `maxDetail=${INVEN_MAX_DETAIL} comments=${INVEN_COLLECT_COMMENTS}`,
      );
    }
    const { stdout } = await execFileAsync(PYTHON_BIN, args, {
      timeout: 60 * 60 * 1000, // 최대 1시간
      // 256MB. stdout 전체를 문자열로 모은 뒤 JSON.parse 하므로 실제 메모리는 페이로드의
      // 2~3배가 잠깐 뜬다. 댓글 원문까지 실리면서 런당 수 MB 수준이 됐다(캡 1200글 기준).
      // 캡 해제(--max-detail 0) 백필은 이 값에 가까워질 수 있으니 날짜를 쪼개 돌릴 것.
      maxBuffer: 256 * 1024 * 1024,
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
