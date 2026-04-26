import { LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

/**
 * 날짜별 파일 로거 (NestJS LoggerService 구현체)
 *
 * 생성 파일:
 *   logs/app-YYYY-MM-DD.log   — 전체 로그 (log/warn/debug/verbose/error)
 *   logs/error-YYYY-MM-DD.log — 에러 전용
 *
 * 터미널 출력도 그대로 유지하므로 개발 중 화면과 파일 양쪽에서 확인 가능.
 * 날짜가 바뀌면 자동으로 새 파일로 전환(일별 로테이션).
 */
export class FileLoggerService implements LoggerService {
  private currentDate = '';
  private appStream: fs.WriteStream | null = null;
  private errorStream: fs.WriteStream | null = null;

  constructor() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  // ─── 내부 유틸 ────────────────────────────────────────────
  private today(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  /** 날짜가 바뀌면 스트림 교체 (일별 로테이션) */
  private ensureStreams() {
    const date = this.today();
    if (date === this.currentDate) return;

    this.appStream?.end();
    this.errorStream?.end();

    this.appStream = fs.createWriteStream(
      path.join(LOG_DIR, `app-${date}.log`),
      { flags: 'a', encoding: 'utf8' },
    );
    this.errorStream = fs.createWriteStream(
      path.join(LOG_DIR, `error-${date}.log`),
      { flags: 'a', encoding: 'utf8' },
    );
    this.currentDate = date;
  }

  private fmt(level: string, message: unknown, context?: string): string {
    const ts = new Date().toISOString();
    const ctx = context ? `[${context}] ` : '';
    const text =
      typeof message === 'string'
        ? message
        : message instanceof Error
          ? message.message
          : String(message);
    return `${ts} [${level.padEnd(7)}] ${ctx}${text}\n`;
  }

  private writeAll(line: string) {
    this.ensureStreams();
    this.appStream?.write(line);
  }

  private writeError(line: string) {
    this.ensureStreams();
    this.appStream?.write(line);
    this.errorStream?.write(line);
  }

  // ─── LoggerService 구현 ───────────────────────────────────
  log(message: unknown, context?: string) {
    const line = this.fmt('LOG', message, context);
    process.stdout.write(line);
    this.writeAll(line);
  }

  warn(message: unknown, context?: string) {
    const line = this.fmt('WARN', message, context);
    process.stdout.write(line);
    this.writeAll(line);
  }

  debug(message: unknown, context?: string) {
    const line = this.fmt('DEBUG', message, context);
    process.stdout.write(line);
    this.writeAll(line);
  }

  verbose(message: unknown, context?: string) {
    const line = this.fmt('VERBOSE', message, context);
    process.stdout.write(line);
    this.writeAll(line);
  }

  error(message: unknown, trace?: string, context?: string) {
    const line = this.fmt('ERROR', message, context);
    const traceLine = trace ? `  Stack: ${trace}\n` : '';
    process.stderr.write(line + traceLine);
    this.writeError(line + traceLine);
  }

  fatal(message: unknown, context?: string) {
    const line = this.fmt('FATAL', message, context);
    process.stderr.write(line);
    this.writeError(line);
  }
}
