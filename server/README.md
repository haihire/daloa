# Server (NestJS)

로스트아크 대시보드 백엔드. NestJS 11 + PostgreSQL (Prisma 7) + Redis + 치지직/유튜브/로스트아크 공식 API + NVIDIA NIM(AI).

---

## 실행

```bash
cd server
pnpm install
pnpm start:dev  # http://localhost:3001
```

`.env` 설정 (핵심 변수 발췌 — 전체 카탈로그는 루트 `.env` 참조):

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:3000

# PostgreSQL (Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/lomoa
PRISMA_DB_SCHEMA=public  # 선택, 기본값 public

# 로스트아크 공식 API
LOSTARK_API_KEY=...

# YouTube Data API v3 (영상 검색 + 라이브)
YOUTUBE_API_KEY=...
YOUTUBE_API_KEY_2=...   # 추가 키 (선택, _3/_4 형식으로 계속 추가 — 할당량 순환)

# 치지직(Chzzk) Open API (실시간 라이브)
CHZZK_CLIENT_ID=...
CHZZK_CLIENT_SECRET=...
CHZZK_LIVE_PAGE_SIZE=20      # 페이지당 조회 수 (API 최대 20)
CHZZK_LIVE_K_BUDGET=25       # 최대 스캔 페이지 수 (로스트아크 필터 전 글로벌 인기순 스캔량)
# CHZZK_THUMBNAIL_RESOLUTION=480

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=...
REDIS_DB=0

# YouTube 전용 Redis (로컬 개발: EC2 운영 Redis SSH 터널 연결)
# YOUTUBE_REDIS_HOST=127.0.0.1
# YOUTUBE_REDIS_PORT=6380
# YOUTUBE_REDIS_READONLY=true  # 로컬에서 갱신 안 함

# NVIDIA NIM (OpenAI 호환) — 관리자 AI 진단 + 사이트 추천 후보 생성
NVIDIA_API_KEY=...
# NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
# NVIDIA_MODEL=qwen/qwen3-next-80b-a3b-instruct

# 카카오 알림 (사이트 변경 감지, 에러 알림)
KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...
KAKAO_REFRESH_TOKEN=...

# 관리자
ADMIN_OWNER_PASSWORD=...   # 오너 계정 비밀번호
ADMIN_DEMO_PASSWORD=...    # 게스트 데모 계정 비밀번호 (선택)

# 텔레메트리 / 배포
TELEMETRY_INGEST_TOKEN=...  # 클라이언트 SSR에서 전송하는 토큰
DEPLOY_EVENT_TOKEN=...      # 배포 이벤트 웹훅 토큰 (모니터링 기록)

# 인벤 파이프라인 (Python 크롤러 연동)
# SITE_FINDER_DIR=../site-finder
# PYTHON_BIN=python

# Vercel ISR 캐시 무효화
NEXT_REVALIDATE_URL=https://www.lomoa.kr/api/revalidate
NEXT_REVALIDATE_SECRET=...
```

---

## 구조

```
server/src/
├── main.ts               # 부트스트랩, CORS, 전역 필터
├── app.module.ts         # 모듈 조합 (스케줄러는 PM2 워커0에서만 기동)
├── instrument.ts         # Sentry 초기화
│
├── prisma/               # PostgreSQL 커넥션 (Prisma 7 + PrismaPg adapter)
├── redis/                # ioredis 클라이언트 (REDIS_CLIENT 토큰)
├── common/               # AllExceptionsFilter, FileLoggerService, LocalDevFlags
│
├── sites/                # GET /api/sites  (Redis 캐시 + 매일 09:00 상태 점검·카카오 알림)
├── streamers/            # 유튜브 영상 + 치지직/유튜브 실시간 라이브
│   ├── streamers.controller.ts   # /api/streamers · /popular · /view-history · /live
│   └── chzzk.client.ts           # 치지직 Open API 클라이언트
├── lostark/              # GET /api/lostark/stats  (공식 API 래퍼 + Rate Limiter)
├── characters/           # 특성 빌드 분류 로직 (characters.service — 관리자 내부용)
├── users/                # 원정대 upsert / 조회 (외부 캐릭터 크롤러 연동)
├── kakao/                # 카카오 알림 서비스 (리프레시 토큰 자동 갱신)
├── revalidate/           # Vercel ISR 캐시 무효화 트리거
└── admin/                # 관리자 API (/api/admin/*)
    ├── admin-auth.*                 # 로그인/로그아웃/세션 (Redis TTL 1h)
    ├── admin-cache.controller.ts    # Redis 캐시 purge
    ├── admin-characters.controller.ts # 캐릭터 목록 조회
    ├── admin-sites.controller.ts    # 사이트 CRUD + 클릭 시계열
    ├── admin-youtube.controller.ts  # 유튜브 영상 차단/해제
    ├── admin-inven.*                # 인벤 크롤 파이프라인 + 사이트 후보 승인
    │   ├── admin-inven-pipeline.service.ts # Python site-finder 실행
    │   ├── admin-inven-cron.service.ts     # 주기 크롤 크론
    │   ├── site-extractor.service.ts       # og:image / 파비콘 추출
    │   └── site-suggest.service.ts         # NVIDIA NIM 메타 생성
    ├── admin-monitoring.*           # APM 대시보드 + 텔레메트리 수집
    │   ├── ai-diagnosis.service.ts         # NVIDIA NIM 컨테이너 진단/채팅
    │   └── docker-stats.service.ts         # 컨테이너 리소스 수집
    └── repositories/                # auth / characters / inven / monitoring
```

---

## API 엔드포인트 (주요)

| 메서드 | 경로                               | 설명                                             |
| ------ | ---------------------------------- | ------------------------------------------------ |
| GET    | `/api/sites`                       | 사이트 목록 (DB + Redis 캐시)                    |
| GET    | `/api/streamers`                   | 유튜브 최신 영상 (`pageToken` 쿼리)              |
| GET    | `/api/streamers/live`              | 실시간 라이브 (`platform=chzzk\|youtube`)        |
| GET    | `/api/streamers/view-history`      | 날짜별 평균 조회수 히스토리 (`days`)             |
| GET    | `/api/lostark/stats`               | 로스트아크 통계                                  |
| POST   | `/api/users/search`                | 원정대 검색 및 DB upsert (`{ characterName }`)   |
| GET    | `/api/users/exists/:name`          | 캐릭터명 존재 여부 (크롤러용)                    |
| GET    | `/api/users/stats`                 | 저장된 유저/원정대 통계                          |
| POST   | `/api/admin/auth/login`            | 관리자 로그인                                    |
| GET    | `/api/admin/sites`                 | 사이트 관리 목록                                 |
| POST   | `/api/admin/youtube/block`         | 유튜브 영상 차단                                 |
| POST   | `/api/admin/inven/pipeline/run`    | 인벤 크롤 파이프라인 실행                        |
| GET    | `/api/admin/inven/site-candidates` | 사이트 추천 후보 목록                            |
| GET    | `/api/admin/monitoring/dashboard`  | 모니터링 대시보드                                |
| GET    | `/api/admin/monitoring/ai-diagnosis` | 컨테이너 AI 진단 (NVIDIA NIM)                  |
| POST   | `/api/telemetry/*`                 | 페이지뷰·요청시간·사이트/유튜브 클릭 수집        |

> `GET /api/streamers/popular`(인기 영상)는 엔드포인트로 남아 있으나 **홈 노출은 폐기**됨. `/api/class-summary`(AI 직업 한줄평)는 모듈째 제거됨.

---

## 주요 로직

### 실시간 라이브 (`streamers.service.ts` · `chzzk.client.ts`)

- **치지직**: Chzzk Open API `/open/v1/lives`(카테고리 필터 없음) 글로벌 인기순을 `CHZZK_LIVE_K_BUDGET` 페이지까지 스캔 → `liveCategoryValue === '로스트아크'` 필터. 크론 1분, Redis TTL 90초(`live:chzzk:current`).
- **유튜브**: `search.list(eventType=live)` + `videos.list(concurrentViewers)`. 크론 20분(쿼터 절약), Redis TTL 12분(`live:youtube:current`). 할당량 초과 시 `YOUTUBE_API_KEY_N` 순환.

### 사이트 점검 (`sites.service.ts`)

- 매일 09:00 각 사이트 HTTP 상태·타이틀 점검, 변경 감지 시 카카오톡 발송.

### 인벤 파이프라인 (`admin/admin-inven-*`)

- Python `site-finder` 크롤러 실행 → 인벤 게시글/사이트 후보 저장.
- 후보에 대해 `site-suggest.service`가 **NVIDIA NIM**으로 name/category/description 생성 → 관리자 승인 시 `loa_sites`로 등록.

### 스케줄러

- PM2 클러스터에서 `NODE_APP_INSTANCE === '0'` 워커만 크론 실행(중복 방지). 로컬 단일 프로세스는 항상 실행.
