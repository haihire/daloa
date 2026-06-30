# Client (Next.js)

로스트아크 대시보드 프론트엔드. Next.js App Router + Tailwind CSS.

---

## 실행

```bash
cd client
pnpm install
pnpm dev   # http://localhost:3000
```

`.env.local` 설정:

```env
NEST_API_URL=http://localhost:3001       # SSR 서버 측 fetch (NEXT_PUBLIC_ 불필요)
REVALIDATE_SECRET=...                    # ISR 무효화 시크릿 (서버 NEXT_REVALIDATE_SECRET과 동일)
TELEMETRY_INGEST_TOKEN=...              # SSR 텔레메트리 인증 토큰 (서버와 동일값)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX          # Google Analytics ID (선택)
```

---

## 구조

```
client/
├── app/
│   ├── layout.tsx              # RootLayout, 폰트, 메타데이터
│   ├── page.tsx                # 메인 페이지 (SSR)
│   ├── sitemap.ts              # SEO 사이트맵
│   ├── robots.ts               # robots.txt
│   ├── globals.css
│   └── admin/                  # 관리자 페이지
│       ├── monitoring/         # 모니터링 대시보드
│       ├── characters/         # 캐릭터 관리
│       └── sites/              # 사이트 관리
│
├── app/api/                    # Next.js API Route (NestJS 프록시)
│   ├── admin/                  # 관리자 API 라우트
│   └── telemetry/              # 텔레메트리 수집
│
├── components/
│   ├── MonitoringBeacon.tsx    # 페이지 뷰·요청 시간 텔레메트리 전송
│   ├── characters/
│   │   └── StatBuildList.tsx   # 특성 빌드 분포 (탭 + 바 차트)
│   ├── class-summary/
│   │   └── ClassSummaryList.tsx # 직업 AI 한줄평
│   ├── sites/
│   │   └── SiteList.tsx        # 사이트 카드 그리드
│   └── youtube/
│       ├── YoutubeList.tsx     # 유튜브 인기 영상 목록
│       └── YoutubeSection.tsx  # 유튜브 섹션 래퍼
│
├── lib/
│   ├── gtag.ts                 # GA4 헬퍼
│   └── admin-role.ts           # 관리자 역할 훅
│
├── types/
│   └── index.ts                # 공유 타입 정의
│
├── proxy.ts                    # Next.js 미들웨어 (API 라우팅)
├── next.config.ts
├── vercel.json                 # Vercel ignoreCommand 설정
└── AGENTS.md                   # 코파일럿 에이전트 규칙
```

---

## 데이터 흐름

| 컴포넌트           | 방식                              | 엔드포인트                        |
| ------------------ | --------------------------------- | --------------------------------- |
| `page.tsx`         | SSR (`fetch` + `revalidate`)      | `GET /api/sites`                  |
| `page.tsx`         | SSR (`fetch` + `revalidate`)      | `GET /api/characters/stat-builds` |
| `StreamerList`     | 클라이언트 fetch (무한 스크롤)    | `GET /api/streamers?pageToken=`   |
| `YoutubeList`      | 클라이언트 fetch                  | `GET /api/streamers/popular`      |
| `ClassSummaryList` | 클라이언트 fetch                  | `GET /api/class-summary`          |

모든 API 요청은 Next.js API Route → NestJS(port 3001)로 프록시됩니다.  
브라우저에서 NestJS를 직접 호출하는 코드 없음.

---

## 특성 빌드 분류

`StatBuildList`는 NestJS에서 분류된 결과를 그대로 표시합니다.

| 탭                                      | 조건                |
| --------------------------------------- | ------------------- |
| 치신 / 신치 / 치특 / 특치 / 신특 / 특신 | 2개 스탯 ≥ 100      |
| 치특신                                  | 3개 스탯 모두 ≥ 100 |
| 미설정                                  | 모든 스탯 < 100     |

---

## 테스트

```bash
cd client
pnpm test
```

Vitest + Testing Library 기반.
