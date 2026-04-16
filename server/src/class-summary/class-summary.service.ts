import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Pool } from 'mysql2/promise';
import type { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { DB_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 직업별 인벤 게시판 ID (기획.md 기준)
const CLASS_BOARD: Record<string, number> = {
  디스트로이어: 5343,
  워로드: 5339,
  버서커: 5341,
  홀리나이트: 5558,
  슬레이어: 5995,
  발키리: 6335,
  배틀마스터: 5342,
  인파이터: 5340,
  기공사: 5344,
  창술사: 5434,
  스트라이커: 5709,
  브레이커: 6155,
  데빌헌터: 5345,
  블래스터: 5349,
  호크아이: 5347,
  스카우터: 5631,
  건슬링어: 5708,
  바드: 5350,
  서머너: 5348,
  아르카나: 5346,
  소서리스: 5770,
  블레이드: 5497,
  데모닉: 5498,
  리퍼: 5647,
  소울이터: 5996,
  도화가: 5861,
  기상술사: 5862,
  환수사: 6334,
  가디언나이트: 6469,
};

const CLASS_LIST = Object.keys(CLASS_BOARD);
const INVEN_BASE_URL = 'https://www.inven.co.kr/board/lostark';
const TITLES_PER_CLASS = 50;
const CRAWL_PAGES = 3;

// 직업 간 처리 간격 (70초 — 무료 티어 RPM 여유 확보)
const STAGGER_DELAY_MS = 70_000;

// Redis 키: 직업별 크롤링 제목 해시
const hashKey = (className: string) => `class-summary:hash:${className}`;

@Injectable()
export class ClassSummaryService implements OnModuleInit {
  private readonly logger = new Logger(ClassSummaryService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private isRunning = false; // 동시 실행 방지

  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.genAI = null;
      this.logger.warn('GEMINI_API_KEY 미설정 — AI 요약 기능 비활성화');
    }
  }

  async onModuleInit() {
    const [rows] = (await (this.pool as any).execute(
      'SELECT COUNT(*) as cnt FROM loa_class_summaries',
    )) as [any[], any];
    if (rows[0].cnt < CLASS_LIST.length) {
      this.logger.log(
        `DB에 ${rows[0].cnt}/${CLASS_LIST.length}개 — 미완성 직업 크롤링 시작`,
      );
      this.runAll().catch((e) =>
        this.logger.error('초기 크롤링 실패', e?.message),
      );
    }
  }

  /** 매 시간 정각 실행 — 29개 직업을 60분에 걸쳐 분산 처리 */
  @Cron('0 0 * * * *')
  async scheduledRun() {
    this.logger.log('시간별 스케줄 크롤링 시작');
    await this.runAll();
  }

  /** 전체 직업 순차 처리 */
  async runAll() {
    if (!this.genAI) {
      this.logger.warn('GEMINI_API_KEY 없음 — 스킵');
      return;
    }
    if (this.isRunning) {
      this.logger.warn('이미 실행 중 — 중복 실행 스킵');
      return;
    }
    this.isRunning = true;
    try {
      for (const className of CLASS_LIST) {
        let calledGemini = false;
        try {
          calledGemini = await this.processClass(className);
        } catch (e) {
          this.logger.error(`[${className}] 처리 실패: ${(e as any)?.message}`);
        }
        // Gemini 호출 시 70초, 스킵 시 2초 대기
        await delay(calledGemini ? STAGGER_DELAY_MS : 2_000);
      }
      this.logger.log('전체 직업 크롤링 완료');
    } finally {
      this.isRunning = false;
    }
  }

  /** 단일 직업: 크롤링 → 해시 비교 → 변경 시에만 Gemini 호출. true=Gemini 호출함 */
  private async processClass(className: string): Promise<boolean> {
    const titles = await this.crawlTitles(className);
    if (titles.length === 0) {
      this.logger.warn(`[${className}] 제목 없음 — 스킵`);
      return false;
    }

    const currentHash = createHash('md5')
      .update(titles.join('\n'))
      .digest('hex');

    // DB에 데이터가 있는 경우에만 해시 비교로 스킵
    const [existing] = (await (this.pool as any).execute(
      'SELECT 1 FROM loa_class_summaries WHERE class_name = ? LIMIT 1',
      [className],
    )) as [any[], any];

    if (existing.length > 0) {
      const prevHash = await this.redis.get(hashKey(className));
      if (prevHash === currentHash) {
        this.logger.debug(`[${className}] 변경 없음 — Gemini 스킵`);
        return false;
      }
    }

    const summary = await this.summarize(className, titles);
    if (!summary) return true; // Gemini 호출은 했으므로 true

    await (this.pool as any).execute(
      `INSERT INTO loa_class_summaries (class_name, summary, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE summary = VALUES(summary), updated_at = NOW()`,
      [className, summary],
    );

    await this.redis.set(hashKey(className), currentHash, 'EX', 25 * 60 * 60);

    this.logger.log(`[${className}] 새 글 감지 → 한줄평 업데이트 완료`);
    return true;
  }

  /** 인벤 게시판에서 글 제목 크롤링 (최대 CRAWL_PAGES 페이지) */
  private async crawlTitles(className: string): Promise<string[]> {
    const boardId = CLASS_BOARD[className];
    if (!boardId) return [];

    const titles: string[] = [];

    for (let page = 1; page <= CRAWL_PAGES; page++) {
      const url =
        page === 1
          ? `${INVEN_BASE_URL}/${boardId}`
          : `${INVEN_BASE_URL}/${boardId}?p=${page}`;

      const res = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://www.inven.co.kr/',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(res.data as string);
      $('td.tit a.subject-link').each((_, el) => {
        const text = $(el).text().trim();
        if (text) titles.push(text);
      });

      if (page < CRAWL_PAGES) await delay(500);
    }

    return titles.slice(0, TITLES_PER_CLASS);
  }

  /** Gemini API로 한줄 트렌드 요약 (429 시 retryDelay 기반 1회 재시도) */
  private async summarize(
    className: string,
    titles: string[],
  ): Promise<string | null> {
    if (!this.genAI) return null;

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });
    const prompt = [
      `다음은 로스트아크 ${className} 직업 관련 최근 커뮤니티 게시글 제목 목록입니다.`,
      `이를 바탕으로 현재 이 직업의 트렌드나 주요 이슈를 한 문장(30자 이내)으로 요약하세요.`,
      `반드시 하나의 짧은 문장만 출력하세요. 설명이나 수식어 없이.`,
      '',
      titles.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    ].join('\n');

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        return result.response.text().trim().replace(/\n.*/s, '');
      } catch (e: any) {
        const msg: string = e?.message ?? '';

        // retryDelay 파싱: "21.5s" 또는 "876ms" 형식
        const secMatch = msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
        const msMatch = msg.match(/"retryDelay"\s*:\s*"([\d.]+)ms"/);
        const retryMs = secMatch
          ? Math.ceil(parseFloat(secMatch[1]) * 1000) + 2000
          : msMatch
            ? Math.ceil(parseFloat(msMatch[1])) + 2000
            : null;

        if (msg.includes('429') && retryMs !== null && attempt < 3) {
          this.logger.warn(
            `[${className}] 429 — ${Math.round(retryMs / 1000)}초 후 재시도 (${attempt}/2)`,
          );
          await delay(retryMs);
          continue;
        }

        this.logger.error(`[${className}] Gemini API 오류: ${msg}`);
        return null;
      }
    }
    return null;
  }

  /** 전체 요약 조회 */
  async findAll(): Promise<
    { className: string; summary: string; updatedAt: string }[]
  > {
    const [rows] = (await (this.pool as any).execute(
      `SELECT class_name AS className, summary,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt
       FROM loa_class_summaries
       ORDER BY FIELD(class_name,
         '디스트로이어','워로드','버서커','홀리나이트','슬레이어','발키리',
         '배틀마스터','인파이터','기공사','창술사','스트라이커','브레이커',
         '데빌헌터','블래스터','호크아이','스카우터','건슬링어',
         '바드','서머너','아르카나','소서리스',
         '블레이드','데모닉','리퍼','소울이터',
         '도화가','기상술사','환수사','가디언나이트'
       )`,
    )) as [any[], any];
    return rows;
  }

  /** 단일 직업 요약 조회 */
  async findOne(
    className: string,
  ): Promise<{ className: string; summary: string; updatedAt: string } | null> {
    const [rows] = (await (this.pool as any).execute(
      `SELECT class_name AS className, summary,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt
       FROM loa_class_summaries WHERE class_name = ?`,
      [className],
    )) as [any[], any];
    return rows[0] ?? null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
