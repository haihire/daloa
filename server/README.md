# Server (NestJS)

로스트아크 대시보드 백엔드. NestJS 11 + PostgreSQL(Prisma 7, pgvector) + Redis + 치지직/유튜브/로스트아크 공식 API + NVIDIA NIM(사이트 추천·운영 챗봇·RAG 임베딩).

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
# AI_MODEL=meta/llama-3.1-8b-instruct           # 사이트 AI 추천(site-suggest) 전용, 가벼운 분류라 8B로 충분
# CHATBOT_AI_MODEL=openai/gpt-oss-120b          # 운영 챗봇(ai-diagnosis) 전용, MoE라 120B급인데 4~7초로 빠름
# RAG_EMBED_MODEL=nvidia/nv-embedqa-e5-v5       # RAG 임베딩 1024차원, 저장=passage/검색=query 로 비대칭 호출
# RAG_WRITER_AI_MODEL=                          # RAG 문서 작성 모델(선택). 미지정 시 CHATBOT_AI_MODEL 사용

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
├── app.module.ts         # 모듈 조합 (스케줄러는 모든 워커에서 기동, 크론별 Redis 락으로 중복 방지)
├── instrument.ts         # Sentry 초기화
│
├── prisma/               # PostgreSQL 커넥션 (Prisma 7 + PrismaPg adapter)
├── redis/                # ioredis 클라이언트 (REDIS_CLIENT 토큰)
├── common/               # AllExceptionsFilter, FileLoggerService, LocalDevFlags
│
├── sites/                # GET /api/sites  (Redis 캐시 + 매일 09:00 상태 점검·카카오 알림)
├── streamers/            # 유튜브 영상 + 치지직/유튜브 실시간 라이브
│   ├── streamers.controller.ts   # /api/streamers · /live
│   └── chzzk.client.ts           # 치지직 Open API 클라이언트
├── feedback/             # POST /api/feedback  (익명 사용자 피드백 + 방문 이력 요약 저장)
├── kakao/                # 카카오 알림 서비스 (리프레시 토큰 자동 갱신)
├── revalidate/           # Vercel ISR 캐시 무효화 트리거
└── admin/                # 관리자 API (/api/admin/*) — 도메인별 하위 폴더로 분리
    ├── auth/                 # 로그인/로그아웃/세션(admin.guard, RequireOwner) — Redis TTL 1h
    ├── cache/                # Redis 캐시 purge
    ├── feedback/             # 사용자 피드백 조회/삭제
    ├── sites/                # 사이트 CRUD + 클릭 시계열
    ├── inven/                # 인벤 크롤 파이프라인 + 사이트 후보 승인
    │   ├── admin-inven-pipeline.service.ts # Python site-finder 실행
    │   ├── admin-inven-cron.service.ts     # 주기 크롤 크론
    │   ├── site-extractor.service.ts       # og:image / 파비콘 추출
    │   └── site-suggest.service.ts         # NVIDIA NIM 메타 생성
    └── monitoring/           # APM 대시보드 + 텔레메트리 수집 + 운영 챗봇
        ├── ai-diagnosis.service.ts         # NVIDIA NIM 컨테이너 진단 + 챗봇 대화(/ai-chat) + CloudWatch CPU 크레딧 판정
        ├── docker-stats.service.ts         # 컨테이너 리소스 수집
        └── rag/                            # pgvector 기반 운영 지식베이스(RAG)
            ├── rag-writer.service.ts       # 주간 스냅샷 문서 생성(append-only) + 임베딩 저장
            ├── rag-embedding.service.ts    # NVIDIA NIM 임베딩 호출(1024차원, passage/query 비대칭)
            ├── rag-snapshot-cron.service.ts # 매주 월요일 04:00(KST) 자동 스냅샷(워커0 락)
            ├── rag-secrets.ts              # 저장 직전 민감정보 2차 스캔(env 값·키 포맷·공인 IP)
            └── rag.repository.ts           # rag_documents/rag_chunks 조회 · 벡터 검색
```

> 각 admin 도메인 폴더(`auth/`, `inven/`, `monitoring/`, `monitoring/rag/`)는 컨트롤러·서비스와 함께 자체 `*.repository.ts`를 갖는다 — 예전에 있던 공용 `admin/repositories/` 폴더는 도메인별로 분산됨.

---

## API 엔드포인트 (주요)

| 메서드 | 경로                                  | 설명                                                     |
| ------ | ------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/sites`                          | 사이트 목록 (DB + Redis 캐시)                            |
| GET    | `/api/streamers`                      | 유튜브 최신 영상 (`pageToken` 쿼리)                      |
| GET    | `/api/streamers/live`                 | 실시간 라이브 (`platform=chzzk\|youtube`)                |
| POST   | `/api/admin/auth/login`               | 관리자 로그인                                            |
| GET    | `/api/admin/sites`                    | 사이트 관리 목록                                         |
| POST   | `/api/admin/inven/pipeline/run`       | 인벤 크롤 파이프라인 실행                                |
| GET    | `/api/admin/inven/site-candidates`    | 사이트 추천 후보 목록                                    |
| POST   | `/api/feedback`                       | 익명 사용자 피드백 등록                                  |
| GET    | `/api/admin/feedback`                 | 사용자 피드백 목록 (방문 이력 요약 포함)                 |
| DELETE | `/api/admin/feedback/:id`             | 사용자 피드백 삭제                                       |
| GET    | `/api/admin/monitoring/dashboard`     | 모니터링 대시보드                                        |
| GET    | `/api/admin/monitoring/ai-diagnosis`  | 컨테이너 AI 진단 (NVIDIA NIM, CloudWatch 크레딧 연동)    |
| POST   | `/api/admin/monitoring/ai-chat`       | 운영 챗봇 대화 (RAG 지식베이스 기반)                     |
| GET    | `/api/admin/monitoring/rag/documents` | RAG 지식베이스 문서 목록                                 |
| POST   | `/api/admin/monitoring/rag/snapshot`  | RAG 스냅샷 수동 생성 (owner 전용, 매주 자동 크론도 있음) |
| POST   | `/api/telemetry/*`                    | 페이지뷰·요청시간·사이트/유튜브 클릭 수집                |

---

## 주요 로직

### 실시간 라이브 (`streamers.service.ts` · `chzzk.client.ts`)

- **치지직**: Chzzk Open API `/open/v1/lives`(카테고리 필터 없음) 글로벌 인기순을 `CHZZK_LIVE_K_BUDGET` 페이지까지 스캔 → `liveCategoryValue === '로스트아크'` 필터. 크론 1분, Redis TTL 90초(`live:chzzk:current`).
- **유튜브**: `search.list(eventType=live)` + `videos.list(concurrentViewers)`. 크론 20분(쿼터 절약), Redis TTL 12분(`live:youtube:current`). 할당량 초과 시 `YOUTUBE_API_KEY_N` 순환.

### 사이트 점검 (`sites.service.ts`)

- 매일 09:00 각 사이트 HTTP 상태·타이틀 점검, 변경 감지 시 카카오톡 발송.

### 인벤 파이프라인 (`admin/inven/`)

- Python `site-finder` 크롤러 실행 → 인벤 게시글/사이트 후보 저장.
- 후보에 대해 `site-suggest.service`가 **NVIDIA NIM**으로 name/category/description 생성 → 관리자 승인 시 `loa_sites`로 등록.
- 증분 크롤은 매 런마다 목록 메타데이터 전체를 저장해 `since_id`를 gap 없이 전진시키고, 본문(상세페이지) fetch만 `INVEN_MAX_DETAIL`(기본 500)로 캡을 둔다 — 캡이 없던 시절 겪은 CPU 데스 스파이럴(신규 글 전체 본문 fetch → 1시간 timeout → SIGKILL → `since_id` 정체 → 백로그 누적) 재발 방지용.

### 운영 챗봇 · RAG (`admin/monitoring/`, `admin/monitoring/rag/`)

- `ai-diagnosis.service`가 컨테이너 메트릭 + EC2 컨텍스트로 1회성 진단(`/ai-diagnosis`)과 대화형 챗봇(`/ai-chat`) 둘 다 처리. 모델은 용도별로 분리(`AI_MODEL`=사이트 추천, `CHATBOT_AI_MODEL`=운영 챗봇, `RAG_EMBED_MODEL`=임베딩).
- pgvector(`rag_documents`/`rag_chunks`, HNSW 인덱스) 기반 지식베이스를 붙여, 최근 7~14일 집계만 보던 챗봇이 그보다 오래된 이상징후·인시던트도 답할 수 있음. 문서는 **append-only**(같은 문서를 덮어쓰지 않음 — LLM 자기수정 드리프트로 근거가 소실되는 것 방지).
- 검색은 절대 거리 임계값으로 관련성을 거르지 않는다(실측상 관련 질문이 무관 질문보다 오히려 멀게 나온 사례가 있어, 관련성 판별은 LLM 프롬프트에 맡기고 임계값은 느슨한 안전선으로만 사용).
- 저장 전 민감정보를 2중으로 거른다: writer 전용 화이트리스트 컨텍스트(1차) + 저장 직전 스캔(2차, `rag-secrets.ts` — env 실제값·키 포맷·공인 IP). 적발값은 로그에도 남기지 않음.
- CPU 크레딧 위험 판정은 LLM이 숫자만 보고 추론하지 않는다 — `ai-diagnosis.service`(`CpuCreditMetrics`)가 24시간 관측 min/max로 결정론적 `balanceStatus`(`near_max`/`declining`/`stable`)를 코드로 계산해 프롬프트에 사실로 전달한다.

### 스케줄러

- 모든 워커에 `ScheduleModule`이 등록된다(워커 고정 없음). 중복 실행 방지는 각 `@Cron`이 개별적으로 Redis 락(`runIfLockAcquired`)으로 처리 — "그 틱에 먼저 락을 잡은 워커만 실행"이라 특정 워커가 죽어도 다른 워커가 자연스럽게 이어받는다(페일오버).
- 신규 크론은 워커 가드를 짜지 않고 공용 락 유틸(`runIfLockAcquired`)을 재사용 — 예: RAG 주간 스냅샷 크론(매주 월요일 04:00 KST).
- 크론이 아닌 부팅 1회성 초기화(DDL 부트스트랩 등)는 여전히 `NODE_APP_INSTANCE === '0'` 가드를 쓴다(예: `AdminMonitoringService.onModuleInit`) — 여러 워커가 동시에 DDL을 치는 경쟁을 막기 위함이며 스케줄러 등록 여부와는 무관하다.
