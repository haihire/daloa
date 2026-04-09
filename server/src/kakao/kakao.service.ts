import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

    // 리프레시 토큰 자체가 갱신된 경우 로그 (수동으로 .env 업데이트 필요)
    if (data.refresh_token) {
      this.logger.warn(
        `⚠️  리프레시 토큰이 갱신되었습니다. .env의 KAKAO_REFRESH_TOKEN을 아래 값으로 교체하세요:\n${data.refresh_token}`,
      );
    }

    return this.accessToken;
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
