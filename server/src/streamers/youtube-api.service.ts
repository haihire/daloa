import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { isLocalQuotaApisDisabled } from '../common/local-dev-flags';

/**
 * YouTube API 키 풀 + 회전. youtube-videos.service.ts(검색/인기)와
 * youtube-live.service.ts(라이브) 양쪽이 같은 키 풀·같은 회전 인덱스를 공유한다
 * (분리 전 streamers.service.ts 에서도 currentKeyIdx 하나를 공유했다 — 한쪽에서
 * 이미 회전한 키를 다른 쪽도 이어서 쓰게 하기 위함, 분리 후에도 동일 인스턴스로 유지).
 */
@Injectable()
export class YoutubeApiService {
  readonly quotaApisDisabled: boolean;
  private readonly keys: ReturnType<typeof google.youtube>[];
  private idx = 0;

  constructor(config: ConfigService) {
    const rawKeys: string[] = [];
    const first = config.get<string>('YOUTUBE_API_KEY', '');
    if (first) rawKeys.push(first);
    for (let i = 2; ; i++) {
      const k = config.get<string>(`YOUTUBE_API_KEY_${i}`, '');
      if (!k) break;
      rawKeys.push(k);
    }
    this.keys = rawKeys.map((k) => google.youtube({ version: 'v3', auth: k }));
    this.quotaApisDisabled = isLocalQuotaApisDisabled(config);
  }

  get current() {
    return this.keys[this.idx];
  }

  get keyCount(): number {
    return this.keys.length;
  }

  get currentIndex(): number {
    return this.idx;
  }

  /** 할당량 초과 시 다음 키로 회전. 회전 후 인덱스를 반환(로그용). */
  rotateKey(): number {
    this.idx = (this.idx + 1) % this.keys.length;
    return this.idx;
  }
}
