import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as dns from 'dns/promises';
import { lookup as dnsLookup } from 'dns';
import * as http from 'http';
import * as https from 'https';

export interface SiteSuggestion {
  name: string;
  category: string;
  description: string;
  icon: string;
}

// 사이트 관리에서 쓰는 카테고리와 동일한 고정 목록.
// db/migrations/008_loa_sites_category_enum.sql 의 CHECK 목록 및
// client/app/admin/sites/page.tsx 의 SITE_CATEGORIES 와 반드시 같이 바꿀 것.
const CATEGORIES = [
  '계산기·툴',
  '빌드·세팅',
  '시세·경제',
  '공략·정보',
  '캐릭터·스펙',
  '전투분석·통계',
  '숙제·일정',
  '커뮤니티',
  '기타',
];

interface SiteMeta {
  title: string;
  description: string;
  favicon: string;
}

/**
 * 추천 후보(사이트)의 category·description을 AI로 생성한다.
 * name(페이지 제목 앞부분)·icon(favicon)은 AI 없이 결정론적으로 뽑는다.
 * 자동 실행 없음 — 관리자가 모달에서 버튼을 누를 때만 호출되므로 토큰은 그때만 소모된다.
 * (키/모델 미설정 시 비활성.)
 */
@Injectable()
export class SiteSuggestService {
  private readonly logger = new Logger(SiteSuggestService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  // DNS rebinding 방어: 연결 직전(Time-of-Use) IP를 재검증하는 커스텀 에이전트
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('NVIDIA_API_KEY');
    const baseURL =
      this.config.get<string>('NVIDIA_BASE_URL') ||
      'https://integrate.api.nvidia.com/v1';
    // 모델은 .env(AI_MODEL)로 지정한다 — 코드에 모델명을 하드코딩하지 않음
    this.model = this.config.get<string>('AI_MODEL') ?? '';
    // 타임아웃 미설정 시 SDK 기본값이 10분 → 모델이 느리면 "AI 추천 중..."이 무한대기.
    // 45초로 제한해 느리면 빠르게 실패(503)시킨다.
    this.client =
      apiKey && this.model
        ? new OpenAI({ apiKey, baseURL, timeout: 45000, maxRetries: 1 })
        : null;
    if (!apiKey || !this.model) {
      this.logger.warn(
        'NVIDIA_API_KEY 또는 AI_MODEL 미설정 — 사이트 AI 추천 비활성화',
      );
    }

    // axios가 실제로 연결할 IP를 lookup 단계에서 검사 → isSafeUrl 선검증과
    // 실제 연결 사이 DNS 레코드가 바뀌는 rebinding 공격을 차단한다.
    const secureLookup: http.AgentOptions['lookup'] = (
      hostname,
      options,
      callback,
    ) => {
      dnsLookup(hostname, options, (err, address, family) => {
        if (err) return callback(err, '', 4);
        const resolved = Array.isArray(address)
          ? address
          : [{ address, family }];
        if (resolved.some((r) => this.isPrivateIp(r.address))) {
          return callback(new Error('사설 IP 접근이 차단되었습니다'), '', 4);
        }
        // Node가 all:true로 호출하면(모던 Node의 autoSelectFamily/happy-eyeballs)
        // 주소 '배열'을 기대한다. dnsLookup이 준 형태를 보존하지 않으면
        // ERR_INVALID_IP_ADDRESS로 외부 fetch가 전부 실패한다.
        if (Array.isArray(address)) {
          callback(null, address);
        } else {
          callback(null, address, family);
        }
      });
    };
    this.httpAgent = new http.Agent({ keepAlive: false, lookup: secureLookup });
    this.httpsAgent = new https.Agent({
      keepAlive: false,
      lookup: secureLookup,
    });
  }

  /**
   * 모달 열 때 자동 채울 name·icon을 한 번의 fetch로 반환한다 (AI 호출 없음).
   * name = 페이지 제목 앞부분, icon = favicon(없으면 google favicon).
   */
  async fetchNameAndIcon(input: {
    url: string;
    domain: string;
  }): Promise<{ name: string; icon: string }> {
    const meta = await this.fetchMeta(input.url);
    return {
      name: nameFromTitle(meta.title, input.domain),
      icon: meta.favicon || this.googleFavicon(input.domain),
    };
  }

  private googleFavicon(domain: string): string {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  /** 사이트 메타를 fetch해 NVIDIA NIM으로 추천 필드를 생성한다. */
  async suggest(input: {
    url: string;
    domain: string;
  }): Promise<SiteSuggestion> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI 키 또는 모델(AI_MODEL)이 설정되지 않았습니다',
      );
    }

    const meta = await this.fetchMeta(input.url);

    const prompt = [
      '너는 로스트아크(게임) 관련 웹사이트를 분류하는 도우미야.',
      '아래 사이트 정보를 보고 한국어로 category와 description을 정해서 JSON 객체만 출력해.',
      `- category: 반드시 다음 중 하나 — ${CATEGORIES.join(', ')}`,
      '- description: 어떤 사이트인지 30자 이내 한 문장',
      'JSON 키는 category, description 두 개만.',
      '',
      `도메인: ${input.domain}`,
      `URL: ${input.url}`,
      meta.title ? `페이지 제목: ${meta.title}` : '',
      meta.description ? `메타 설명: ${meta.description}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    let raw: string;
    try {
      // response_format=json_object → 모델이 JSON만 출력 (프롬프트에 "JSON" 명시 필요)
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      raw = completion.choices[0]?.message?.content ?? '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      // 429(할당량/속도 제한)는 일시적 — 원본 에러 대신 사용자 안내 메시지로 변환.
      // openai SDK는 HTTP 상태를 e.status로 제공하므로 우선 그것으로 판정하고,
      // 메시지 정규식은 포맷이 다른 경우를 위한 보조 수단으로 둔다.
      const isRateLimit =
        (e instanceof OpenAI.APIError && e.status === 429) ||
        /429|quota|rate limit|too many requests/i.test(msg);
      if (isRateLimit) {
        this.logger.warn(`NVIDIA 할당량 초과: ${msg}`);
        throw new ServiceUnavailableException(
          'AI 추천 요청이 많아 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.',
        );
      }
      this.logger.warn(`NVIDIA 호출 실패: ${msg}`);
      throw new ServiceUnavailableException(
        'AI 추천 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    const parsed = this.parse(raw);

    // enum을 강제하지만, 모델이 범위 밖 값을 내도 '기타'로 방어
    const category =
      typeof parsed.category === 'string' &&
      CATEGORIES.includes(parsed.category.trim())
        ? parsed.category.trim()
        : '기타';

    // name·icon은 AI가 아니라 결정론적으로 (제목 앞부분 / favicon)
    return {
      name: nameFromTitle(meta.title, input.domain),
      category,
      description: parsed.description?.trim() || '',
      icon: meta.favicon || this.googleFavicon(input.domain),
    };
  }

  private parse(raw: string): Partial<SiteSuggestion> {
    try {
      const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
      const obj: unknown = JSON.parse(cleaned);
      // null·배열·원시값 방어 — 순수 객체일 때만 사용
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return obj as Partial<SiteSuggestion>;
      }
      return {};
    } catch {
      this.logger.warn(`NVIDIA JSON 파싱 실패: ${raw.slice(0, 120)}`);
      return {};
    }
  }

  /** 사이트 메타(title/description/favicon) 추출. 실패/위험 URL이면 빈 값 반환(추천은 진행). */
  private async fetchMeta(url: string): Promise<SiteMeta> {
    // SSRF 방어: 크롤된 미검증 URL이므로 내부망/메타데이터 요청 차단
    if (!(await this.isSafeUrl(url))) {
      this.logger.warn(`안전하지 않은 URL — 메타 fetch 스킵: ${url}`);
      return { title: '', description: '', favicon: '' };
    }
    try {
      const res = await axios.get<string>(url, {
        timeout: 8000,
        maxContentLength: 3 * 1024 * 1024,
        maxRedirects: 2,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      const $ = cheerio.load(res.data);
      const title =
        $('title').first().text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        '';
      const description =
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '';
      // favicon: <link rel="icon">(shortcut icon 포함) → apple-touch-icon 순
      let favicon =
        $('link[rel~="icon"]').attr('href')?.trim() ||
        $('link[rel="apple-touch-icon"]').attr('href')?.trim() ||
        '';
      // 상대 경로(favicon.png, /favicon.ico 등)는 대상 사이트 기준 절대 URL로 변환
      if (favicon) {
        try {
          favicon = new URL(favicon, url).href;
        } catch {
          favicon = '';
        }
      }
      return { title, description, favicon };
    } catch {
      this.logger.debug(`사이트 메타 추출 실패 — 도메인만으로 추천: ${url}`);
      return { title: '', description: '', favicon: '' };
    }
  }

  /**
   * http(s) + 공인 호스트만 허용. 호스트네임을 DNS로 실제 IP까지 해석해
   * 사설/루프백/링크로컬 대역이면 차단 (DNS rebinding 우회 방어).
   */
  private async isSafeUrl(raw: string): Promise<boolean> {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost')) return false;

    // 호스트네임의 실제 IP를 해석해 검증 (IP 리터럴/조회 실패 시 host 자체 검사)
    let ips: string[];
    try {
      ips = (await dns.lookup(host, { all: true })).map((r) => r.address);
    } catch {
      ips = [host];
    }
    return ips.every((ip) => !this.isPrivateIp(ip));
  }

  /** 사설/루프백/링크로컬/예약 IP 여부. */
  private isPrivateIp(ip: string): boolean {
    // ::ffff:127.0.0.1 같은 IPv4-mapped IPv6는 IPv4 부분으로 정규화 후 검사
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    // IPv4 리터럴 사설/예약 대역
    const m = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true; // 링크로컬(AWS 메타데이터 169.254.169.254)
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    }
    // IPv6 미지정(::)/루프백/ULA/링크로컬
    if (
      normalized === '::' ||
      normalized === '::1' ||
      /^f[cde]/i.test(normalized)
    )
      return true;
    return false;
  }
}

/**
 * 페이지 <title>의 앞부분(사이트 이름)만 뽑는다. AI 없이 결정론적.
 * "벨로아 - 로스트아크 매물 알리미" → "벨로아", "로펙 | ..." → "로펙".
 * 구분자(-, |, », – 등)가 없으면 제목 전체, 제목이 없으면 도메인.
 */
function nameFromTitle(title: string, domain: string): string {
  const t = title.trim();
  if (!t) return domain;
  const first = t.split(/\s*[|»–—]\s*|\s+-\s+/)[0]?.trim();
  return first || t || domain;
}
