import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 카카오톡 "나에게 보내기" 알림 서비스
 *
 * .env 필수 항목:
 *   KAKAO_REST_API_KEY   - 앱 REST API 키 (developers.kakao.com)
 *   KAKAO_REFRESH_TOKEN  - OAuth 리프레시 토큰 (1회 발급 후 저장, 유효기간 2개월)
 *
 * 최초 토큰 발급 방법:
 *   1. https://developers.kakao.com → 앱 생성 → 카카오 로그인 활성화
 *   2. 플랫폼 > Web > http://localhost 등록
 *   3. 아래 URL로 인가 코드 발급:
 *      https://kauth.kakao.com/oauth/authorize
 *        ?client_id={REST_API_KEY}
 *        &redirect_uri=http://localhost
 *        &response_type=code
 *   4. 리다이렉트된 URL의 code= 값을 복사
 *   5. 아래 curl로 토큰 발급:
 *      curl -X POST https://kauth.kakao.com/oauth/token \
 *        -d grant_type=authorization_code \
 *        -d client_id={REST_API_KEY} \
 *        -d redirect_uri=http://localhost \
 *        -d code={code값}
 *   6. 응답의 refresh_token→ .env KAKAO_REFRESH_TOKEN 에 저장
 */
@Injectable()
export class KakaoService {
  private readonly logger = new Logger(KakaoService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  constructor(private readonly config: ConfigService) {}

  /** 일반 텍스트 알림 전송 */
  async send(text: string): Promise<void> {
    await this.sendToMe(text);
  }

  /** 사이트 변경 알림 전송 */
  async notifySiteChange(changes: SiteChange[]): Promise<void> {
    if (changes.length === 0) return;
    const lines = changes.map((c) => {
      const parts: string[] = [`[${c.name}]`];
      if (c.titleChanged)
        parts.push(`제목 변경: "${c.oldTitle}" → "${c.newTitle}"`);
      if (c.downChanged)
        parts.push(c.isDown ? `⚠️ 접속 불가 (${c.status})` : `✅ 복구됨`);
      return parts.join('\n  ');
    });

    const text =
      `🔔 로아 사이트 변경 감지 (${new Date().toLocaleDateString('ko-KR')})\n\n` +
      lines.join('\n\n');

    await this.sendToMe(text);
  }

  // ─── private ─────────────────────────────────────────────────────────────────

  private async sendToMe(text: string): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      this.logger.warn('카카오 액세스 토큰 없음 - 알림 전송 건너뜀');
      return;
    }

    const body = new URLSearchParams({
      template_object: JSON.stringify({
        object_type: 'text',
        text,
        link: {
          web_url: 'https://loawa.com',
          mobile_web_url: 'https://loawa.com',
        },
        button_title: '확인',
      }),
    });

    const res = await fetch(
      'https://kapi.kakao.com/v2/api/talk/memo/default/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`카카오 전송 실패: ${res.status} ${err}`);
    } else {
      this.logger.log('카카오톡 알림 전송 완료');
    }
  }

  private async getAccessToken(): Promise<string | null> {
    // 유효한 액세스 토큰이 있으면 재사용
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const refreshToken = this.config.get<string>('KAKAO_REFRESH_TOKEN');
    const restApiKey = this.config.get<string>('KAKAO_REST_API_KEY');
    const clientSecret = this.config.get<string>('KAKAO_CLIENT_SECRET');

    if (!refreshToken || !restApiKey) {
      this.logger.warn('KAKAO_REST_API_KEY 또는 KAKAO_REFRESH_TOKEN 미설정');
      return null;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: restApiKey,
      refresh_token: refreshToken,
    });

    // 클라이언트 시크릿 활성화 시 필수
    if (clientSecret) body.set('client_secret', clientSecret);

    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      this.logger.error(`액세스 토큰 갱신 실패: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    if (data.refresh_token) {
      await this.updateRefreshToken(data.refresh_token);
    }

    return this.accessToken;
  }

  /**
   * 매일 오전 9시 — 리프레시 토큰 만료 D-7 이내일 때 강제 갱신 시도 및 알림
   * KAKAO_REFRESH_TOKEN_ISSUED_AT 환경변수 기준으로 만료일 계산 (YYYY-MM-DD)
   */
  @Cron('0 0 9 * * *')
  async checkRefreshTokenExpiry(): Promise<void> {
    const issuedAtStr =
      process.env['KAKAO_REFRESH_TOKEN_ISSUED_AT'] ??
      this.config.get<string>('KAKAO_REFRESH_TOKEN_ISSUED_AT');
    if (!issuedAtStr) return;

    const expiresAt = new Date(
      new Date(issuedAtStr).getTime() + 60 * 24 * 60 * 60 * 1000,
    );
    const daysLeft = Math.ceil(
      (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );

    if (daysLeft > 7) return;

    // D-7 이내 → 강제 갱신 시도 (Kakao는 만료 30일 전부터 새 토큰 반환)
    const prevToken = process.env['KAKAO_REFRESH_TOKEN'];
    this.accessToken = null; // 캐시 무효화로 Kakao API 강제 호출
    await this.getAccessToken();

    // updateRefreshToken 내에서 이미 알림 발송됨
    if (process.env['KAKAO_REFRESH_TOKEN'] !== prevToken) return;

    // 갱신 실패 → 수동 안내
    const expiresStr = expiresAt.toLocaleDateString('ko-KR');
    await this.sendToMe(
      `⚠️ 카카오 리프레시 토큰 만료 임박 (D-${daysLeft})\n만료일: ${expiresStr}\n자동 갱신 실패 — EC2 .env의 KAKAO_REFRESH_TOKEN 수동 업데이트 필요`,
    );
  }

  /**
   * 새 리프레시 토큰을 process.env 및 /app/.env 파일에 저장 후 카톡 알림
   */
  private async updateRefreshToken(newToken: string): Promise<void> {
    const envPath = path.join(process.cwd(), '.env');
    const issuedAt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 메모리 즉시 반영
    process.env['KAKAO_REFRESH_TOKEN'] = newToken;
    process.env['KAKAO_REFRESH_TOKEN_ISSUED_AT'] = issuedAt;

    // .env 파일 업데이트 (재시작 후에도 유지)
    try {
      let content = fs.readFileSync(envPath, 'utf-8');

      content = content.includes('KAKAO_REFRESH_TOKEN=')
        ? content.replace(
            /^KAKAO_REFRESH_TOKEN=.*/m,
            `KAKAO_REFRESH_TOKEN=${newToken}`,
          )
        : content + `\nKAKAO_REFRESH_TOKEN=${newToken}`;

      content = content.includes('KAKAO_REFRESH_TOKEN_ISSUED_AT=')
        ? content.replace(
            /^KAKAO_REFRESH_TOKEN_ISSUED_AT=.*/m,
            `KAKAO_REFRESH_TOKEN_ISSUED_AT=${issuedAt}`,
          )
        : content + `\nKAKAO_REFRESH_TOKEN_ISSUED_AT=${issuedAt}`;

      fs.writeFileSync(envPath, content, 'utf-8');
      this.logger.log(`리프레시 토큰 자동 갱신 → .env 저장 완료 (${envPath})`);
    } catch (e) {
      this.logger.error(`리프레시 토큰 .env 쓰기 실패: ${e}`);
    }

    // 카카오톡 알림 (getAccessToken → sendToMe 경로이므로 accessToken은 이미 유효)
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const expiresStr = expiresAt.toLocaleDateString('ko-KR');
    try {
      await this.sendToMe(
        `✅ 카카오 리프레시 토큰 자동 갱신 완료\n새 만료일: ${expiresStr}\n.env 파일 자동 업데이트됨`,
      );
    } catch (e) {
      this.logger.error(`갱신 알림 발송 실패: ${e}`);
    }
  }
}

export interface SiteChange {
  name: string;
  titleChanged: boolean;
  oldTitle?: string;
  newTitle?: string;
  downChanged: boolean;
  isDown: boolean;
  status?: number;
}
