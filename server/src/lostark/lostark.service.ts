import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BASE = 'https://developer-lostark.game.onstove.com';

const RATE_LIMIT = 80; // 분당 최대 요청 수 (100회 한도의 80%)
const WINDOW_MS = 60_000; // 1분 윈도우

@Injectable()
export class LostarkService {
  // 모든 LostArk API 호출을 직렬화하는 Promise 체인
  private apiQueue: Promise<void> = Promise.resolve();

  // 이중 체크용 윈도우 상태
  private windowStart = Date.now();
  private windowCount = 0;

  constructor(private readonly config: ConfigService) {}

  private getHeaders() {
    return {
      Authorization: `bearer ${this.config.get<string>('LOSTARK_API_KEY')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * 이중 체크 rate limiter
   * ① 시간 체크: 1분 윈도우가 지났으면 카운터 리셋
   * ② 카운트 체크: 80회 도달 시 윈도우 종료까지 대기 후 리셋
   */
  private async rateCheck(): Promise<void> {
    const now = Date.now();

    // ① 시간 체크
    if (now - this.windowStart >= WINDOW_MS) {
      this.windowStart = now;
      this.windowCount = 0;
    }

    // ② 카운트 체크
    if (this.windowCount >= RATE_LIMIT) {
      const waitMs = WINDOW_MS - (now - this.windowStart) + 500; // 0.5초 여유
      console.log(
        `[RateLimit] ${RATE_LIMIT}회 도달 → ${Math.ceil(waitMs / 1000)}초 대기`,
      );
      await new Promise<void>((r) => setTimeout(r, waitMs));
      this.windowStart = Date.now();
      this.windowCount = 0;
    }

    this.windowCount++;
  }

  /** 모든 LostArk API 호출을 직렬 큐 + rate limiter로 실행 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.apiQueue.then(() => this.rateCheck()).then(fn);
    this.apiQueue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async fetchSiblings(characterName: string): Promise<any[]> {
    return this.enqueue(async () => {
      const enc = encodeURIComponent(characterName);
      const res = await fetch(`${BASE}/characters/${enc}/siblings`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`siblings API error: ${res.status}`);
      return res.json() as Promise<any[]>;
    });
  }

  async fetchArmory(characterName: string): Promise<any> {
    return this.enqueue(async () => {
      const enc = encodeURIComponent(characterName);
      const res = await fetch(`${BASE}/armories/characters/${enc}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`armory API error: ${res.status}`);
      return res.json();
    });
  }

  /** 현재 윈도우 내 API 호출 횟수 반환 */
  getStats(): {
    callsThisWindow: number;
    limit: number;
    windowResetInMs: number;
  } {
    const now = Date.now();
    const elapsed = now - this.windowStart;
    const windowResetInMs = elapsed >= WINDOW_MS ? 0 : WINDOW_MS - elapsed;
    const callsThisWindow = elapsed >= WINDOW_MS ? 0 : this.windowCount;
    return { callsThisWindow, limit: RATE_LIMIT, windowResetInMs };
  }
}
