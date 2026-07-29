# Client (Next.js)

로스트아크 대시보드 프론트엔드. Next.js 16 App Router + React 19 + Tailwind CSS 4.

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
│   ├── page.tsx                # 메인 페이지 (SSR ISR, revalidate 600s)
│   ├── global-error.tsx        # 전역 에러 바운더리 (Sentry)
│   ├── sitemap.ts / robots.ts  # SEO
│   ├── globals.css
│   ├── admin/                  # 관리자 페이지 (CSR)
│   │   ├── login/              # 로그인
│   │   ├── sites/              # 사이트 관리
│   │   ├── youtube/            # 유튜브 영상 차단 관리
│   │   ├── inven/              # 인벤 크롤 파이프라인 · 사이트 후보 승인
│   │   ├── monitoring/         # APM 모니터링 대시보드
│   │   ├── containers/         # 컨테이너 리소스 + AI 진단
│   │   └── cache/              # Redis 캐시 관리
│   └── api/                    # Next.js API Route (NestJS 프록시 / BFF)
│       ├── admin/              # 관리자 API 라우트
│       ├── streamers/          # 라이브/영상 프록시
│       ├── revalidate/         # ISR 무효화 수신
│       └── telemetry/          # 텔레메트리 수집
│
├── components/
│   ├── DarkModeToggle(.tsx/Guard.tsx) # 다크모드 토글
│   ├── GoogleAnalytics.tsx     # GA4 로더
│   ├── MonitoringBeacon.tsx    # 페이지뷰·요청시간 텔레메트리 전송
│   ├── admin/AdminDatePicker.tsx
│   ├── sites/SiteList.tsx      # 사이트 카드 그리드 (홈)
│   └── stream/                 # 실시간 라이브 (홈)
│       ├── StreamSection.tsx   # SSR 래퍼 (초기 치지직 라이브)
│       └── StreamList.tsx      # 치지직/유튜브 토글 + 클라이언트 fetch
│
├── lib/
│   ├── gtag.ts                 # GA4 헬퍼
│   └── admin-role.ts           # 관리자 역할 훅
│
├── types/index.ts             # 공유 타입 정의
├── proxy.ts                    # Next.js 미들웨어 (API 라우팅)
├── next.config.ts
├── vercel.json                 # Vercel ignoreCommand 설정
└── AGENTS.md                   # 코파일럿 에이전트 규칙
```

---

## 데이터 흐름

| 컴포넌트        | 방식                           | 엔드포인트                                 |
| --------------- | ------------------------------ | ------------------------------------------ |
| `page.tsx`      | SSR (`fetch` + ISR revalidate) | `GET /api/sites`                           |
| `StreamSection` | SSR (초기 라이브)              | `GET /api/streamers/live?platform=chzzk`   |
| `StreamList`    | 클라이언트 fetch (토글)        | `GET /api/streamers/live?platform=youtube` |

모든 API 요청은 Next.js API Route → NestJS(port 3001)로 프록시됩니다.
브라우저에서 NestJS를 직접 호출하는 코드 없음.

## 테스트

```bash
cd client
pnpm test
```

Vitest + Testing Library 기반.
