/**
 * RAG 문서에 민감정보가 섞여 들어가는 것을 막는 2차 방어(안전망).
 *
 * 1차 방어는 RagWriterService.buildWriterContext() — 애초에 필요한 필드만 화이트리스트로
 * 담아 LLM에 넘기므로 시크릿에 접근할 경로 자체가 없다.
 * 여기는 "프롬프트가 잘못됐거나 나중에 컨텍스트 함수가 넓어졌을 때" 저장 직전에 걸러내는
 * 마지막 관문이다. 프롬프트 규칙만으로는 모델 실수를 막을 수 없으므로 코드로 강제한다.
 */

/**
 * 문서에 절대 노출되면 안 되는 환경변수 키 목록.
 * server/README.md의 .env 카탈로그 기준으로 명시(운영자가 직접 유지보수).
 */
export const SECRET_ENV_KEYS: readonly string[] = [
  // DB
  'DATABASE_URL',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  // 인프라 / AWS
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_ROLE_TO_ASSUME',
  'EC2_INSTANCE_ID',
  'ECR_REGISTRY',
  // 외부 API
  'NVIDIA_API_KEY',
  'LOSTARK_API_KEY',
  'YOUTUBE_API_KEY',
  'CHZZK_CLIENT_ID',
  'CHZZK_CLIENT_SECRET',
  'KAKAO_REST_API_KEY',
  'KAKAO_CLIENT_SECRET',
  'KAKAO_REFRESH_TOKEN',
  // 캐시
  'REDIS_PASSWORD',
  'YOUTUBE_REDIS_PASSWORD',
  // 관리자 계정
  'ADMIN_OWNER_PASSWORD',
  'ADMIN_DEMO_PASSWORD',
  // 토큰
  'TELEMETRY_INGEST_TOKEN',
  'DEPLOY_EVENT_TOKEN',
  'NEXT_REVALIDATE_SECRET',
  'SENTRY_AUTH_TOKEN',
];

/**
 * 위 목록에 없더라도 이름이 시크릿 형태인 env는 자동 포함한다.
 * 나중에 새 시크릿 env가 추가돼도 이 파일을 고치는 걸 잊어서 새는 일을 막는다.
 * (YOUTUBE_API_KEY_2 처럼 접미사가 붙는 것도 여기서 걸린다.)
 */
const SECRET_NAME_PATTERN = /(KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL)S?(_\d+)?$/i;

/** env 값이 이 길이 미만이면 우연히 문서에 포함될 수 있어 값 비교 대상에서 제외한다. */
const MIN_SECRET_VALUE_LEN = 8;

/** 값이 아니라 '형태'로 잡아내는 패턴 — env에 없는 경로로 흘러든 시크릿 대비. */
const SECRET_SHAPE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['NVIDIA API 키 형식', /\bnvapi-[A-Za-z0-9_-]{10,}/],
  ['AWS 액세스 키 형식', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['개인키(PEM) 블록', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT 형식', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ['postgres 접속 문자열', /\bpostgres(?:ql)?:\/\/[^\s@]+:[^\s@]+@/i],
  ['redis 접속 문자열', /\bredis:\/\/[^\s@]*:[^\s@]+@/i],
];

/** 공인 IPv4(EC2 퍼블릭 IP 등). 사설/루프백 대역은 노출돼도 무해하므로 제외. */
const PUBLIC_IPV4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;

function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** 검사 대상 env 키 = 명시 목록 + 이름이 시크릿 형태인 모든 env. */
function resolveSecretEnvKeys(): string[] {
  const keys = new Set<string>(SECRET_ENV_KEYS);
  for (const key of Object.keys(process.env)) {
    if (SECRET_NAME_PATTERN.test(key)) keys.add(key);
  }
  return [...keys];
}

/**
 * 텍스트에 민감정보가 들어있는지 검사한다.
 * 반환값이 빈 배열이 아니면 저장하지 말 것.
 *
 * 주의: 적발된 '값' 자체는 절대 반환하지 않는다 — 반환값이 로그로 나가기 때문에
 * 여기서 값을 담으면 로그가 곧 유출 경로가 된다. 무엇이 걸렸는지 이름만 알린다.
 */
export function findSecretLeaks(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();

  // 1) 실제 env 값이 문서에 그대로 박혔는지 (가장 확실한 신호)
  for (const key of resolveSecretEnvKeys()) {
    const value = process.env[key];
    if (!value || value.length < MIN_SECRET_VALUE_LEN) continue;
    if (text.includes(value)) hits.add(`env:${key}`);
  }

  // 2) 값을 몰라도 형태로 알 수 있는 것들
  for (const [label, re] of SECRET_SHAPE_PATTERNS) {
    if (re.test(text)) hits.add(label);
  }

  // 3) 공인 IP (EC2 주소 노출 방지)
  for (const m of text.matchAll(PUBLIC_IPV4)) {
    const [a, b, c, d] = [m[1], m[2], m[3], m[4]].map(Number);
    if ([a, b, c, d].some((n) => n > 255)) continue; // 버전 문자열 등 오탐 제외
    if (!isPrivateIpv4(a, b)) {
      hits.add('공인 IP 주소');
      break;
    }
  }

  return [...hits];
}

/** 문서 생성 프롬프트에 넣을 금지 규칙 — 1차로 모델에게도 명시한다. */
export const SECRET_PROMPT_RULES = [
  '민감정보 금지(매우 중요) — 아래는 어떤 형태로도 문서에 쓰지 마라:',
  '- DB: 접속 URL·계정명·비밀번호·관리자 계정(admin_users) 정보',
  '- EC2/인프라: 퍼블릭·프라이빗 IP, SSH 키(pem), AWS 액세스 키, 인스턴스 ID',
  '- 서버: API 키·시크릿·토큰 등 환경변수 값 일체',
  '  (NVIDIA/로스트아크/유튜브/치지직/카카오 키, 관리자 비밀번호, 배포·텔레메트리 토큰 등)',
  '위 정보는 애초에 제공되지도 않으므로, 모르면 추측하지 말고 그냥 언급하지 마라.',
].join('\n');
