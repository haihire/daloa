# 프로젝트 폴더 구조

## 전체 트리

```
daloa/
├── .env                          # 환경변수 (Git 미포함)
├── .gitignore
├── AGENTS.md                     # 에이전트 공통 규칙
├── docker-compose.yml            # 프로덕션 + 공용 서비스 정의
├── docker-compose.override.yml   # 로컬 개발 전용 오버라이드 (Git 미포함)
│
├── .github/
│   ├── copilot-instructions.md   # Copilot 워크스페이스 지침
│   ├── pull_request_template.md  # PR 템플릿
│   ├── BRANCH_PROTECTION_CHECKLIST.md
│   ├── SETUP_GUIDE.md
│   └── workflows/
│       ├── pr-check.yml          # PR 빌드·테스트 CI (main 직접 푸시 방어)
│       ├── pr-ci.yml             # PR 추가 CI
│       ├── main-post-merge.yml   # main 머지 후 배포 트리거
│       └── server-e2e.yml        # E2E 테스트
│
├── client/                       # ── Next.js 15 App Router (Vercel 배포) ──
│   ├── AGENTS.md                 # 클라이언트 에이전트 규칙
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts          # Vitest 테스트 설정
│   ├── vitest.setup.ts
│   ├── instrumentation.ts        # 서버 부팅 시 로그 가로채기
│   ├── app/
│   │   ├── layout.tsx            # 루트 레이아웃
│   │   ├── page.tsx              # 메인 페이지 (SSR, cache: 'no-store')
│   │   ├── sitemap.ts            # SEO 사이트맵
│   │   ├── robots.ts             # robots.txt 생성
│   │   ├── globals.css
│   │   ├── favicon.ico
│   │   └── icon.png
│   ├── components/
│   │   ├── GoogleAnalytics.tsx   # GA4 태그 삽입
│   │   ├── characters/
│   │   │   ├── StatBuildList.tsx  # 특성 빌드 통계
│   │   │   └── StatBuildList.test.tsx
│   │   ├── class-summary/
│   │   │   ├── ClassSummaryList.tsx
│   │   │   └── ClassSummaryList.test.tsx
│   │   ├── sites/
│   │   │   ├── SiteList.tsx      # 사이트 목록
│   │   │   └── SiteList.test.tsx
│   │   ├── streamers/
│   │   │   ├── StreamerList.tsx
│   │   │   └── StreamerList.test.tsx
│   │   └── youtube/
│   │       ├── YoutubeList.tsx
│   │       └── YoutubeList.test.tsx
│   ├── lib/
│   │   └── gtag.ts               # GA4 헬퍼 함수
│   ├── types/
│   │   └── index.ts              # 공용 타입 정의
│   ├── public/                   # 정적 에셋
│   └── logs/                     # 런타임 로그 (Git 미포함)
│
├── server/                       # ── NestJS (Docker → EC2 배포) ──
│   ├── AGENTS.md                 # 서버 에이전트 규칙
│   ├── Dockerfile                # 프로덕션 이미지 (node:20-alpine)
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── src/
│   │   ├── main.ts               # 엔트리포인트 (포트 3001)
│   │   ├── app.module.ts         # 루트 모듈
│   │   ├── characters/           # 특성 빌드 API
│   │   │   ├── characters.module.ts
│   │   │   ├── characters.controller.ts
│   │   │   ├── characters.service.ts
│   │   │   └── characters.service.spec.ts
│   │   ├── class-summary/        # 직업 요약 API
│   │   │   ├── class-summary.module.ts
│   │   │   ├── class-summary.controller.ts
│   │   │   ├── class-summary.service.ts
│   │   │   └── class-summary.service.spec.ts
│   │   ├── lostark/              # LostArk Open API 프록시 + Rate Limiter
│   │   │   ├── lostark.module.ts
│   │   │   ├── lostark.controller.ts
│   │   │   └── lostark.service.ts
│   │   ├── sites/                # 사이트 목록 API (Redis 캐시 + 한글 깨짐 복구)
│   │   │   ├── sites.module.ts
│   │   │   ├── sites.controller.ts
│   │   │   ├── sites.service.ts
│   │   │   └── sites.service.spec.ts
│   │   ├── streamers/            # 스트리머 API
│   │   │   ├── streamers.module.ts
│   │   │   ├── streamers.controller.ts
│   │   │   ├── streamers.service.ts
│   │   │   └── streamers.service.spec.ts
│   │   ├── users/                # 유저(원정대) API
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   └── users.service.ts
│   │   ├── kakao/                # 카카오 링크 API
│   │   │   ├── kakao.module.ts
│   │   │   └── kakao.service.ts
│   │   ├── db/
│   │   │   └── db.module.ts      # MariaDB 커넥션 풀 (mysql2)
│   │   ├── redis/
│   │   │   └── redis.module.ts   # Redis 커넥션 (ioredis)
│   │   └── common/
│   │       ├── http-exception.filter.ts
│   │       ├── file-logger.service.ts  # 파일 로거 (일별 로테이션, 30일 자동 정리)
│   │       └── local-dev-flags.ts      # 로컬 개발 전용 플래그
│   ├── test/
│   │   ├── jest-e2e.json
│   │   ├── jest-integration.json
│   │   ├── app.e2e-spec.ts       # E2E 테스트
│   │   └── korean-encoding.integration-spec.ts  # 한글 인코딩 통합 테스트
│   └── logs/                     # 런타임 로그 (Git 미포함)
│
├── crawlers/                     # ── Python 크롤러 (EC2에서 수동 실행) ──
│   ├── crawl_rank.py             # loawa.com → LostArk API → DB 파이프라인
│   ├── requirements.txt          # curl_cffi, aiomysql 등
│   └── logs/                     # 크롤러 로그 (Git 미포함)
│
├── nginx/
│   └── default.conf              # api.daloa.kr → NestJS 리버스 프록시
│
├── scripts/
│   ├── dev.ps1                   # 로컬 개발 환경 시작 (포트 정리 + 재시작)
│   ├── test.ps1                  # 전체 테스트 실행
│   ├── deploy.ps1                # EC2 배포 스크립트
│   ├── cleanup-logs.ps1          # 30일 이상 로그 자동 삭제 (dev.ps1 시작 시 자동 실행)
│   ├── init-db.sql               # DB 스키마 초기화
│   ├── sync-sites.sql            # 사이트 목록 DB 동기화 (desired_sites CTE)
│   ├── dump.sql                  # DB 데이터 덤프 (Git 미포함)
│   ├── dump-db.js                # 덤프 스크립트
│   ├── seed_expedition.mjs       # 원정대 시드 데이터
│   └── seed_sites.mjs            # 사이트 시드 데이터
│
├── context/                      # ── AI 컨텍스트 문서 ──
│   ├── INDEX.md                  # 목차
│   ├── architecture.md           # 시스템 아키텍처
│   ├── db-schema.md              # DB 스키마
│   ├── api-contracts.md          # API 계약
│   ├── env-config.md             # 환경변수 설명
│   ├── redis-keys.md             # Redis 키 설계
│   ├── folder-structure.md       # 폴더 트리 (이 파일)
│   └── deployment.md             # EC2·Vercel·DNS·SSL 배포 절차
│
└── docs/                         # ── 개발 문서 ──
    ├── HARNESS.md                # 테스트·워크플로우 규칙 전체
    ├── record.md                 # 개발 문제/해결 기록
    ├── 기획.md                   # 기능 기획 문서
    └── technicalRead/            # 기술 학습 노트
        └── ES6문제.md            # CJS vs ESM, NestJS와의 충돌 원리
```

---

## 인프라 구성도

```
┌─────────────────────────────────────────────────────────┐
│  사용자 브라우저                                          │
└────────┬──────────────────────────────┬─────────────────┘
         │ daloa.kr (HTTPS)             │ api.daloa.kr (HTTPS)
         ▼                              ▼
┌─────────────────┐          ┌────────────────────────────────────┐
│  Vercel          │          │  AWS EC2 (Ubuntu)                  │
│  ┌─────────────┐ │          │  ┌──────────────────────────────┐  │
│  │ Next.js SSR │ │          │  │ Docker Compose               │  │
│  │ (client/)   │ │          │  │  ┌────────┐  ┌─────────────┐ │  │
│  └─────────────┘ │          │  │  │ Nginx  │→│ NestJS:3001 │ │  │
└─────────────────┘          │  │  │ :80/443│  └──────┬──────┘ │  │
                              │  │  └────────┘         │        │  │
                              │  │  ┌────────┐  ┌──────┴──────┐ │  │
                              │  │  │ Redis  │  │ MySQL 8.0   │ │  │
                              │  │  │ :6379  │  │ :3306       │ │  │
                              │  │  └────────┘  └─────────────┘ │  │
                              │  └──────────────────────────────┘  │
                              │  ┌──────────────────────────────┐  │
                              │  │ Python 크롤러 (수동 실행)     │  │
                              │  └──────────────────────────────┘  │
                              └────────────────────────────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │ 가비아 DNS          │
                              │ daloa.kr → Vercel  │
                              │ api.daloa.kr → EC2 │
                              └───────────────────┘
```

---

## 포트 정리

| 서비스  | 로컬 포트 | EC2 포트    | 비고                              |
| ------- | --------- | ----------- | --------------------------------- |
| Next.js | 3000      | —           | Vercel에서 호스팅                 |
| NestJS  | 3001      | 3001 (내부) | Nginx가 443 → 3001 프록시         |
| Nginx   | —         | 80, 443     | SSL 종단점, HTTP→HTTPS 리다이렉트 |
| MySQL   | 3306      | 3306 (내부) | Docker 내부 네트워크 전용         |
| Redis   | 6379      | 6379 (내부) | Docker 내부 네트워크 전용         |

---

## Docker Compose 프로파일

| 파일                          | 대상 환경    | 실행 서비스                    |
| ----------------------------- | ------------ | ------------------------------ |
| `docker-compose.yml`          | EC2 프로덕션 | mysql, redis, nest, nginx      |
| `docker-compose.override.yml` | 로컬 개발    | redis, nest (MySQL/Nginx 제외) |
