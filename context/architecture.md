# 시스템 아키텍처

## 전체 구조

```
[사용자 브라우저]
      │
      ▼
[Nginx (80/443)]  ← EC2 프로덕션
      │
      ├── api.daloa.kr → [NestJS :3001]  ←─┐
      └── daloa.kr     → [Next.js :3000] ──┘
                                            │ SSR fetch
                                            ▼
                                       [NestJS :3001]
                                            │
                               ┌────────────┼────────────┐
                               ▼            ▼            ▼
                          [MariaDB]     [Redis]    [외부 API]
                          (lost_ark)   (:6379)    (LostArk / YouTube / Kakao)
```

**로컬 개발**은 Nginx 없이 Next.js(3000) → NestJS(3001) 직접 통신.

---

## 컴포넌트별 역할

### `client/` — Next.js 15 App Router (포트 3000)

- **SSR 전용** — 브라우저에서 NestJS를 직접 호출하지 않음
- `app/page.tsx`: `Promise.all`로 3개 API 동시 fetch → 한 번에 렌더링
- `app/sitemap.ts`: SEO용 sitemap.xml 자동 생성
- `instrumentation.ts`: 서버 시작 시 console 가로채기 → `logs/` 기록
- 컴포넌트는 `"use client"` 지시자 있는 것만 클라이언트 번들 포함

### `server/` — NestJS (포트 3001)

- **글로벌 Provider**: `DbModule`(DB_POOL), `RedisModule`(REDIS_CLIENT), `ConfigModule`
- **비즈니스 모듈**: `SitesModule`, `CharactersModule`, `StreamersModule`, `ClassSummaryModule`, `UsersModule`, `LostarkModule`, `KakaoModule`
- **크론**: `SitesService`(매일 09:00 사이트 점검), `StreamersService`(매시 YouTube 갱신)
- **에러 필터**: `AllExceptionsFilter` — 5xx 발생 시 카카오 알림, 1분 쿨다운
- **로거**: 
  - `FileLoggerService` — 서버 애플리케이션 로그를 `logs/app-YYYY-MM-DD.log`, `logs/error-YYYY-MM-DD.log`에 기록 (일별 로테이션)
  - 개발 시작 스크립트: `scripts/dev.ps1` — 서버/클라이언트 dev 서버의 콘솔 stdout+stderr를 각 `logs/app-YYYY-MM-DD.log`에 append
  - **로그 정리**: `scripts/cleanup-logs.ps1` — 기본값 30일 이상 경과한 로그 자동 삭제 (dev.ps1에서 시작 시 자동 실행)

### `crawlers/` — Python (curl_cffi + asyncio)

- `crawl_rank.py`: loawa.com 전투력 순위 → LostArk API → MariaDB 저장
- **파이프라인**: Producer → name_queue → Checker(×30) → search_queue → Searcher
- **Rate Limiter**: NestJS `LostarkService` 내부 직렬 큐, 분당 80회 제한(한도 100의 80%)
- 실행 로그: `crawlers/logs/crawl-YYYY-MM-DD_HH-MM-SS.log` (cleanup-logs.ps1 대상)

### `nginx/` — 리버스 프록시 (프로덕션)

- HTTP(80) → HTTPS(301) 리다이렉트
- `api.daloa.kr` → NestJS, `daloa.kr` → Next.js
- SSL: Let's Encrypt (`/etc/letsencrypt/`)

---

## 데이터 흐름

### 사이트 목록 조회

```
브라우저 → Next.js SSR
           → GET /api/sites (NestJS)
               → Redis 체크 (sites:all, TTL 10분)
               → 캐시 미스 시 MariaDB 조회
               → Redis 저장 후 반환
```

### 유튜버 영상 조회

```
GET /api/streamers?pageToken=xxx
  → Redis 체크 (youtube:videos:page:N)
  → 캐시 미스 → YouTube Data API v3
  → quota_exceeded 키 존재 시 API 차단(자동 재개: KST 16:00)
  → Redis TTL 1시간
```

### 크롤러 → DB 저장 흐름

```
loawa.com API → character_name 수집
  → GET /api/users/exists/:name → 신규만 필터
  → POST /api/users/search → LostArk API → DB upsert
```

---

## 모듈 의존 관계

```
AppModule
├── ConfigModule (global)
├── ScheduleModule
├── DbModule (global) ──────────── DB_POOL 제공
├── RedisModule (global) ────────── REDIS_CLIENT 제공
├── KakaoModule (global) ────────── KakaoService 제공
├── SitesModule       ← DB_POOL, REDIS_CLIENT, KakaoService
├── CharactersModule  ← DB_POOL
├── StreamersModule   ← REDIS_CLIENT, ConfigService
├── ClassSummaryModule← DB_POOL, REDIS_CLIENT, ConfigService(Gemini AI)
├── UsersModule       ← DB_POOL, LostarkService
├── LostarkModule     ← ConfigService
└── KakaoModule       ← ConfigService
```

---

## 배포 환경 (EC2)

- `docker-compose.yml`: `nest`(NestJS), `nginx` 컨테이너
- Next.js는 EC2에서 `pm2`로 직접 실행 (컨테이너 외부)
- MariaDB는 EC2 호스트에 직접 설치 (컨테이너 미사용)
- Redis는 EC2 호스트에 직접 설치
