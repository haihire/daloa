# 내 스택 기준 웹 보안 체크리스트

> OWASP Top 10 항목을 **현재 프로젝트가 실제로 쓰는 툴**에 매핑한 점검표.
> 스택 출처: `client/package.json`, `server/package.json`, 메모리(Nginx·Vercel·EC2·Docker·PM2)

---

## 현재 스택 한눈에

| 영역 | 사용 툴 |
|------|---------|
| 프론트 | Next.js 16, React 19, Vercel(ISR), Tailwind v4, Recharts |
| 백엔드 | NestJS 11, Express 플랫폼 |
| 인증 | `@nestjs/jwt` (JWT), `bcrypt` (비밀번호 해시) |
| DB / ORM | PostgreSQL, Prisma 7 (`@prisma/client` + `@prisma/adapter-pg` + `pg`) |
| 캐시/세션 | Redis (`ioredis`) — `admin:session` UUID 저장 |
| 외부 API | `googleapis`(YouTube), `@google/generative-ai`, `openai`, `axios`, `cheerio`(크롤링) |
| 인프라 | Nginx(리버스 프록시·SSL·rate limit), Docker, PM2 cluster, EC2 |
| 모니터링 | Sentry (`@sentry/nestjs`, `@sentry/nextjs`) |
| 스케줄 | `@nestjs/schedule`, `node-cron` |

---

## 1. 입력 검증 / 인젝션 (A03)

- [x] **SQL 인젝션** → Prisma ORM이 파라미터 바인딩 처리. raw 쿼리(`$queryRaw`) 쓸 땐 `Prisma.sql`/태그드 템플릿으로 파라미터화 (문자열 연결 금지)
- [x] **XSS** → React가 기본 escape. `dangerouslySetInnerHTML` 사용처만 점검
- [ ] **입력 화이트리스트 검증** ⚠️ — `class-validator`/`class-transformer` **미설치**. NestJS DTO에 `ValidationPipe` 적용 안 돼 있을 가능성 → 추가 권장
  - 권장: `pnpm add class-validator class-transformer` → `app.useGlobalPipes(new ValidationPipe({ whitelist: true }))`
- [ ] **CSRF** → JWT를 쿠키가 아닌 `Authorization` 헤더로 보내면 CSRF 영향 적음. **쿠키 세션을 쓴다면** CSRF 토큰 필요 (현재 `admin:session` 저장 방식 확인 후 판단)
- [ ] `cheerio` 크롤링 대상 HTML/URL 신뢰 범위 점검 (외부 입력으로 크롤 대상이 정해지면 SSRF 연결)

## 2. 인증 / 세션 (A07)

- [x] **비밀번호 해시** → `bcrypt` 사용 중 (평문·단순 해시 아님) ✓
- [x] **세션 중앙 저장** → Redis `admin:session` UUID (PM2 워커 간 일치)
- [ ] **세션 만료(TTL)** 및 로그아웃 시 Redis 키 삭제 확인
- [ ] **JWT 만료(exp)·시크릿 관리** → `@nestjs/jwt` 시크릿을 `.env`로 분리, 짧은 만료 + 갱신 전략
- [ ] **MFA** → 관리자 기능에 2차 인증 (현재 미적용, 도입 검토)
- [ ] **로그인 브루트포스 제한** → Nginx rate limit(120r/m) 외에 로그인 엔드포인트 별도 시도 제한 고려

## 3. 권한 / 접근 통제 (A01)

- [ ] 모든 보호 라우트에 NestJS Guard(JWT/role) 적용, 누락 라우트 없는지
- [ ] **IDOR** → 리소스 요청 시 소유자 == 세션 사용자 확인
- [ ] 관리자 API 경로/권한 분리
- [ ] 클라이언트 권한을 서버에서 항상 재검증 (UI 숨김에 의존 X)
- [ ] 최소 권한 원칙 — DB 계정·서비스 권한 최소화

## 4. 데이터 보호 / 암호화 (A02)

- [x] **전송 암호화** → Nginx에서 HTTPS(TLS) 종단, HTTP→HTTPS 리다이렉트
- [ ] **HSTS** 헤더 설정 (Nginx)
- [ ] **비밀값 분리** → API 키(Google/OpenAI/Sentry), JWT 시크릿, DB 비번을 `.env`로, git 커밋 금지(`.gitignore` 확인)
- [ ] 프론트 노출 변수(`NEXT_PUBLIC_`)에 비밀값 넣지 않기 (서버 전용 키 클라 노출 금지)
- [ ] 저장 민감데이터(PII 등) 있으면 암호화 (현재 도메인상 결제·주민번호 없으면 N/A)

## 5. 구성 오류 / 공급망 (A05, A06)

- [ ] **에러 노출 통제** → 프로덕션에서 스택트레이스·DB 에러 숨김 (NestJS exception filter)
- [ ] **불필요 기능 제거** → `start:debug`, 디버그 포트, 샘플 라우트 프로덕션 비활성
- [ ] **보안 헤더** → CSP, X-Frame-Options, X-Content-Type-Options 등. **`helmet` 미설치** → Nginx에서 헤더 추가하거나 `pnpm add helmet` 검토
- [ ] **`server_tokens off`** (Nginx 버전 숨김)
- [ ] **CORS** 화이트리스트 (`app.enableCors`에 허용 origin만, `*` 지양)
- [ ] **의존성 취약점 스캔** → `pnpm audit` 정기 실행, lock 파일 커밋. Prisma/Next 등 메이저 최신이라 패치 추적

## 6. SSRF / 외부 호출 (A10)

- [ ] `axios`로 **사용자 입력 URL** 요청하는 기능 점검 → 도메인 화이트리스트
- [ ] `cheerio` 크롤 대상이 외부 입력으로 결정되면 내부망(169.254.x.x, localhost) 접근 차단
- [ ] 외부 API 쿼터 보호 → YouTube 쿼터: 캐시 + 분산 락(`SET NX EX`) + PM2 워커0 가드로 중복 호출 방지 (이미 적용)

## 7. 로깅 / 모니터링 (A09)

- [x] **Sentry** 에러 모니터링 (프론트·백엔드 양쪽)
  - [ ] Spike Protection 켜기 / DSN rate limit / Inbound Filter (`study/keyword.md` 참조)
- [ ] 로그인 실패·권한 변경·주요 데이터 접근 이벤트 로깅
- [ ] **민감정보 마스킹** → 로그·Sentry에 비밀번호·토큰·PII 평문 금지 (`beforeSend`로 스크러빙)
- [ ] CPU 스파이크·비정상 트래픽 알림 (docker_metrics 모니터링 활용)

## 8. DoS / 가용성 (A04)

- [x] Nginx rate limit 120r/m (단일 IP 보호)
- [ ] 비싼 엔드포인트(AI 호출 `openai`/`generative-ai`, 크롤링) 별도 제한·타임아웃
- [ ] PM2 `max_memory_restart`로 메모리 폭주 시 워커 재시작 (적용됨)

---

## ⚠️ 우선 보완 후보 (미설치/미적용 의심)

1. **입력 검증** — `class-validator` + 전역 `ValidationPipe` (whitelist) 도입
2. **보안 헤더** — `helmet` 또는 Nginx 헤더 (CSP, HSTS 등)
3. **CSRF** — 쿠키 세션이면 토큰, 헤더 JWT면 영향 적음 → 인증 방식부터 확정
4. **MFA** — 관리자 계정 2차 인증
