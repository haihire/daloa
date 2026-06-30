# Server (NestJS)

로스트아크 대시보드 백엔드. NestJS + PostgreSQL (Prisma 7) + Redis + YouTube Data API + 로스트아크 공식 API.

---

## 실행

```bash
cd server
pnpm install
pnpm start:dev  # http://localhost:3001
```

`.env` 설정:

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:3000

# PostgreSQL (Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/lomoa
PRISMA_DB_SCHEMA=public  # 선택, 기본값 public

# 로스트아크 공식 API
LOSTARK_API_KEY=...

# YouTube Data API v3
YOUTUBE_API_KEY=...
YOUTUBE_API_KEY_2=...   # 추가 키 (선택, _3/_4 형식으로 계속 추가 가능)

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=...
REDIS_DB=0

# YouTube 전용 Redis (로컬 개발: EC2 운영 Redis SSH 터널 연결)
# YOUTUBE_REDIS_HOST=127.0.0.1
# YOUTUBE_REDIS_PORT=6380
# YOUTUBE_REDIS_PASSWORD=...
# YOUTUBE_REDIS_DB=0
# YOUTUBE_REDIS_READONLY=true  # 로컬에서 갱신 안 함

# Gemini AI (직업 한줄평 생성)
GEMINI_API_KEY=...

# 카카오 알림 (사이트 변경 감지, 에러 알림)
KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...
KAKAO_REFRESH_TOKEN=...

# 관리자
ADMIN_OWNER_PASSWORD=...   # 오너 계정 비밀번호
ADMIN_DEMO_PASSWORD=...    # 게스트 데모 계정 비밀번호 (선택)

# 텔레메트리
TELEMETRY_INGEST_TOKEN=...  # 클라이언트 SSR에서 전송하는 토큰

# Vercel ISR 캐시 무효화
NEXT_REVALIDATE_URL=https://www.lomoa.kr/api/revalidate
NEXT_REVALIDATE_SECRET=...
```

---

## 구조

```
server/src/
├── main.ts               # 부트스트랩, CORS, 전역 필터
├── app.module.ts         # 모듈 조합
│
├── prisma/               # PostgreSQL 커넥션 (Prisma 7 + PrismaPg adapter)
├── redis/                # ioredis 클라이언트 (REDIS_CLIENT 토큰)
├── common/               # AllExceptionsFilter, FileLoggerService, LocalDevFlags
│
├── admin/                # 관리자 API (/api/admin/*)
│   ├── admin-auth.controller.ts      # 로그인/로그아웃/세션
│   ├── admin-auth.service.ts         # 세션 발급 (Redis TTL 1h)
│   ├── admin-cache.controller.ts     # Redis 캐시 삭제
│   ├── admin-characters.controller.ts # 캐릭터 목록 조회
│   ├── admin-monitoring.controller.ts # 모니터링 대시보드 + 텔레메트리 수집
│   ├── admin-monitoring.service.ts
│   ├── admin-sites.controller.ts     # 사이트 CRUD
│   ├── admin.guard.ts                # AdminGuard, AdminWriteGuard
│   └── repositories/
│       ├── admin-auth.repository.ts
│       ├── admin-characters.repository.ts
│       └── monitoring.repository.ts
│
├── lostark/              # 로스트아크 API 래퍼 + Rate Limiter
├── sites/                # GET /api/sites  (Redis 캐시 + 매일 09:00 상태 점검)
├── streamers/            # GET /api/streamers?pageToken=  (YouTube 영상, 3h 갱신)
├── characters/           # GET /api/characters/stat-builds
├── class-summary/        # GET /api/class-summary  (Gemini AI 직업 한줄평)
├── users/                # POST /api/users/search  (원정대 upsert)
│                         # GET  /api/users/exists/:name
│                         # GET  /api/users/stats
├── kakao/                # 카카오 알림 서비스
└── revalidate/           # Vercel ISR 캐시 무효화 트리거
```

---

## API 엔드포인트

| 메서드 | 경로                          | 설명                                           |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/sites`                  | 사이트 목록 (DB + Redis 캐시)                  |
| GET    | `/api/streamers`              | 유튜브 영상 목록 (`pageToken` 쿼리)            |
| GET    | `/api/streamers/popular`      | 인기 영상 (`offset`, `limit` 쿼리)             |
| GET    | `/api/characters/stat-builds` | 특성 빌드별 직업 분포                          |
| GET    | `/api/class-summary`          | 전체 직업 AI 한줄평                            |
| POST   | `/api/users/search`           | 원정대 검색 및 DB upsert (`{ characterName }`) |
| GET    | `/api/users/exists/:name`     | 캐릭터명 존재 여부 (크롤러용)                  |
| GET    | `/api/users/stats`            | 저장된 유저/원정대 통계                        |
| POST   | `/api/admin/auth/login`       | 관리자 로그인                                  |
| POST   | `/api/admin/auth/logout`      | 관리자 로그아웃                                |
| GET    | `/api/admin/monitoring/dashboard` | 모니터링 대시보드                         |

---

## 주요 로직

### 특성 빌드 분류 (`characters.service.ts`)

`loa_users.stat_crit/spec/swift` 기준:

| 조건                | 분류                                                |
| ------------------- | --------------------------------------------------- |
| 스탯 3개 모두 ≥ 100 | 치특신                                              |
| 스탯 2개 ≥ 100      | 높은 순서로 앞글자 (예: 치명 1500, 신속 600 → 치신) |
| 스탯 1개만 ≥ 100    | 1순위 스탯 기준 쌍으로 분류                         |
| 모두 < 100          | 미설정                                              |

### 스트리머 영상 캐시 (`streamers.service.ts`)

- 서버 시작 시 1회 + 이후 **3시간마다** Cron 갱신 (`0 */3 * * *`)
- Redis TTL **4시간** (만료 공백 없음)
- `YOUTUBE_API_KEY_N` 형식으로 멀티 키 지원 (할당량 초과 시 다음 키로 자동 교체)
- 캐시 미스 시 Redis 분산 락으로 Thundering Herd 방지

### 사이트 점검 (`sites.service.ts`)

- 매일 09:00 각 사이트 HTTP 상태·타이틀 점검
- 변경 감지 시 카카오톡 메시지 발송
