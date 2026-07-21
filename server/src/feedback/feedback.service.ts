import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FeedbackRepository } from './feedback.repository';

export const FEEDBACK_MAX_LENGTH = 500;

const PER_IP_WINDOW_MS = 10 * 60_000;
const PER_IP_MAX_PER_WINDOW = 5;
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX_PER_WINDOW = 60;

export interface FeedbackSubmitInput {
  message?: string;
  path?: string;
  deviceType?: string;
  clientIp: string;
}

@Injectable()
export class FeedbackService {
  // 익명 저장이 원칙이라 IP는 DB에 남기지 않는다. 스팸 차단에 필요한 만큼만
  // 메모리에 최근 제출 시각을 들고 있다가 윈도우가 지나면 버린다.
  private readonly submitsByIp = new Map<string, number[]>();
  private globalWindowStartedAt = Date.now();
  private globalWindowCount = 0;

  constructor(private readonly repo: FeedbackRepository) {}

  async submit(input: FeedbackSubmitInput): Promise<{ ok: true; id: number }> {
    const message = (input.message ?? '').trim();
    if (!message) {
      throw new BadRequestException('메시지를 입력해주세요.');
    }
    if (message.length > FEEDBACK_MAX_LENGTH) {
      throw new BadRequestException(
        `메시지는 ${FEEDBACK_MAX_LENGTH}자 이내로 입력해주세요.`,
      );
    }

    this.consumeQuota(input.clientIp);

    const id = await this.repo.create({
      message,
      path: (input.path ?? '/').slice(0, 200),
      deviceType: input.deviceType ?? 'unknown',
    });
    return { ok: true, id };
  }

  /**
   * 레이트리밋 2단:
   *  - IP당 10분 5건 (개인 도배 차단)
   *  - 전체 1분 60건 (분산 스팸에 대한 DB 보호 backstop)
   */
  private consumeQuota(clientIp: string): void {
    const now = Date.now();

    if (now - this.globalWindowStartedAt >= GLOBAL_WINDOW_MS) {
      this.globalWindowStartedAt = now;
      this.globalWindowCount = 0;
    }
    this.globalWindowCount += 1;
    if (this.globalWindowCount > GLOBAL_MAX_PER_WINDOW) {
      throw new HttpException(
        '요청이 많아 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.pruneExpired(now);

    const key = clientIp || 'unknown';
    const recent = (this.submitsByIp.get(key) ?? []).filter(
      (at) => now - at < PER_IP_WINDOW_MS,
    );
    if (recent.length >= PER_IP_MAX_PER_WINDOW) {
      throw new HttpException(
        '잠시 후 다시 의견을 남겨주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.submitsByIp.set(key, recent);
  }

  /** 윈도우가 끝난 IP 항목을 버려 Map이 무한히 커지지 않게 한다. */
  private pruneExpired(now: number): void {
    for (const [ip, timestamps] of this.submitsByIp) {
      const alive = timestamps.filter((at) => now - at < PER_IP_WINDOW_MS);
      if (alive.length === 0) {
        this.submitsByIp.delete(ip);
      } else if (alive.length !== timestamps.length) {
        this.submitsByIp.set(ip, alive);
      }
    }
  }
}
