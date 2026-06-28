# 웹 보안 체크리스트

> 점검용 리스트. 스택: NestJS(API) + Nginx(리버스 프록시) + Next.js/Vercel(프론트) + PostgreSQL + Redis
> 기준: OWASP Top 10 (2021) 기반 + 현재 프로젝트 맥락

---

## OWASP Top 10 (2021) 요약

| 코드 | 이름 | 핵심 |
|------|------|------|
| A01 | 접근 통제 실패 (Broken Access Control) | 권한 없는 리소스 접근, IDOR |
| A02 | 암호화 실패 (Cryptographic Failures) | 평문 저장·전송, 약한 알고리즘 |
| A03 | 인젝션 (Injection) | SQL/NoSQL/Command/XSS |
| A04 | 안전하지 않은 설계 (Insecure Design) | 설계 단계 위협 모델링 부재 |
| A05 | 보안 설정 오류 (Security Misconfiguration) | 기본값, 불필요 기능 노출 |
| A06 | 취약/구식 컴포넌트 (Vulnerable Components) | 오래된 의존성 |
| A07 | 인증/식별 실패 (Identification & Auth Failures) | 약한 세션·비밀번호 정책 |
| A08 | 데이터 무결성 실패 (Software & Data Integrity) | 미검증 업데이트, 역직렬화 |
| A09 | 로깅/모니터링 실패 (Logging & Monitoring) | 침해 탐지·대응 불가 |
| A10 | 서버측 요청 위조 (SSRF) | 서버가 공격자 지정 URL로 요청 |

---

## 1. 인증 / 세션 (A01, A07)

- [ ] 세션 토큰을 안전하게 저장 (현재: `admin:session` UUID → Redis 중앙 저장)
- [ ] 세션 만료(TTL) 설정 및 로그아웃 시 무효화
- [ ] 쿠키 플래그: `HttpOnly`, `Secure`, `SameSite`
- [ ] 비밀번호 해싱 (bcrypt/argon2, 평문·단순 해시 금지)
- [ ] 관리자 계정 시드값·기본 비밀번호 제거
- [ ] 로그인 브루트포스 방지 (rate limit / 시도 제한)

## 2. 접근 통제 (A01)

- [ ] 모든 보호 엔드포인트에 인증·인가 가드 적용 (누락된 라우트 없는지)
- [ ] IDOR 점검: 리소스 ID로 남의 데이터 접근 불가 (소유권 검증)
- [ ] 관리자 API와 일반 API 경로/권한 분리
- [ ] 프론트 숨김(UI hide)에 의존하지 말고 서버에서 권한 검사

## 3. 인젝션 / 입력 검증 (A03)

- [ ] SQL: Prisma ORM 파라미터 바인딩 사용, raw SQL은 반드시 파라미터화
- [ ] DTO 검증 (class-validator 등)으로 입력 화이트리스트
- [ ] XSS: 사용자 입력 출력 시 이스케이프 (React 기본 escape, `dangerouslySetInnerHTML` 주의)
- [ ] 파일 업로드 시 타입·크기·확장자 검증

## 4. 전송/저장 암호화 (A02)

- [ ] HTTPS 강제 (Nginx에서 SSL 종단, HTTP→HTTPS 리다이렉트)
- [ ] 민감정보(비밀번호·토큰·API 키) 평문 저장 금지
- [ ] `.env` 비밀값 git 커밋 금지 (`.gitignore` 확인)
- [ ] DB 백업 파일 접근 통제

## 5. 보안 설정 (A05)

- [ ] 보안 헤더: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- [ ] 서버 버전·기술 스택 헤더 숨기기 (Nginx `server_tokens off`)
- [ ] CORS 화이트리스트 (허용 origin만, `*` 지양)
- [ ] 백엔드를 인터넷에 직접 노출하지 않음 (Nginx 리버스 프록시 경유)
- [ ] 에러 응답에 스택트레이스·내부 경로 노출 금지 (프로덕션)
- [ ] 디버그/관리 엔드포인트 프로덕션 비활성

## 6. Rate Limit / DoS (A04, 가용성)

- [ ] Nginx rate limit 적용 (현재: 120r/m)
- [ ] 비싼 엔드포인트(외부 API 호출 등) 별도 제한
- [ ] 외부 API 쿼터 보호 (YouTube 등 — 캐시·분산 락으로 중복 호출 방지)

## 7. 의존성 / 공급망 (A06, A08)

- [ ] `npm audit` 정기 점검, 취약 패키지 업데이트
- [ ] lock 파일(package-lock.json) 커밋으로 버전 고정
- [ ] 신뢰할 수 없는 서드파티 패키지·스크립트 지양

## 8. SSRF (A10)

- [ ] 사용자 입력 URL로 서버가 요청하는 기능 점검 (있으면 도메인 화이트리스트)
- [ ] 내부 네트워크/메타데이터 엔드포인트(169.254.x.x 등) 접근 차단

## 9. 로깅 / 모니터링 (A09)

- [ ] 인증 실패·권한 거부·예외 로깅 (단, 민감정보는 마스킹)
- [ ] Sentry 등 에러 모니터링 (Spike Protection, DSN rate limit, Inbound Filter — `study/keyword.md` 참조)
- [ ] 비정상 트래픽·CPU 스파이크 알림 (docker_metrics 모니터링 활용)
- [ ] 로그에 비밀번호·토큰·PII 평문 출력 금지

## 10. 프론트 / Vercel 특이사항

- [ ] 클라이언트 노출 환경변수(`NEXT_PUBLIC_`)에 비밀값 넣지 않기
- [ ] API 키 등 서버 전용 값은 서버 사이드에서만 사용
- [ ] ISR 캐시에 사용자별 민감 데이터가 구워지지 않게 주의 (정적 페이지는 공용)
