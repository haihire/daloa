# Client (Next.js)

로스트아크 대시보드 프론트엔드. Next.js App Router + Tailwind CSS.

---

## 실행

```bash
cd client
npm install
npm run dev   # http://localhost:3000
```

`.env.local` 설정:

```env
NEST_API_URL=http://localhost:3001            # SSR 서버 측 fetch
NEXT_PUBLIC_NEST_API_URL=http://localhost:3001 # 클라이언트 컴포넌트 fetch
```

---

## 구조

```
client/
├── app/
│   ├── layout.tsx          # RootLayout, 폰트, 메타데이터
│   ├── page.tsx            # 메인 페이지 (SSR)
│   └── globals.css         # Tailwind + fade-in 애니메이션
│
├── components/
│   ├── characters/
│   │   └── StatBuildList.tsx   # 특성 빌드 분포 (탭 + 바 차트)
│   ├── sites/
│   │   └── SiteList.tsx        # 사이트 카드 그리드
│   └── streamers/
│       └── StreamerList.tsx    # 유튜브 라이브 목록 (무한 스크롤)
│
├── types/
│   └── index.ts            # 공유 타입 정의
│
├── public/
│   └── favicon.ico
│
├── next.config.ts          # Google favicon remotePatterns 허용
├── .env.local              # 환경 변수
└── AGENTS.md               # 코파일럿 에이전트 규칙
```

---

## 데이터 흐름

| 컴포넌트       | 방식                              | 엔드포인트                        |
| -------------- | --------------------------------- | --------------------------------- |
| `page.tsx`     | SSR (`fetch` + `revalidate: 300`) | `GET /api/sites`                  |
| `page.tsx`     | SSR (`fetch` + `revalidate: 300`) | `GET /api/characters/stat-builds` |
| `StreamerList` | 클라이언트 fetch (무한 스크롤)    | `GET /api/streamers?page=&size=`  |

모든 API 요청은 NestJS 서버(port 3001)로 직접 전달됩니다.

---

## 타입

| 타입            | 용도                             |
| --------------- | -------------------------------- |
| `Site`          | 사이트 카드 데이터               |
| `Streamer`      | 유튜브 라이브 스트리머 단건      |
| `StatBuildItem` | 특성 빌드 항목 (직업명 + 인원수) |
| `StatBuildTab`  | 특성 빌드 탭 (치신/신치/치특 등) |

---

## 특성 빌드 분류

`StatBuildList`는 NestJS에서 분류된 결과를 그대로 표시합니다.

| 탭                                      | 조건                |
| --------------------------------------- | ------------------- |
| 치신 / 신치 / 치특 / 특치 / 신특 / 특신 | 2개 스탯 ≥ 100      |
| 치특신                                  | 3개 스탯 모두 ≥ 100 |
| 미설정                                  | 모든 스탯 < 100     |
