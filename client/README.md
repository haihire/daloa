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

---

## 테스트 가이드 (요약)

Vitest + Testing Library 기준으로 아래 체크리스트를 기본 적용합니다.

### 실행

```bash
cd client
npm test
```

### 품질 체크리스트

- 테스트 이름과 assertion은 1:1로 대응합니다.
	- 예: "로딩 메시지 표시" 테스트면 실제 로딩 텍스트를 검증합니다.
- 인덱스 기반 선택(`getAllByRole(...)[1]`)을 지양하고 이름/레이블 기반 선택을 사용합니다.
	- 예: `getByRole('button', { name: /다음/i })`
- 예외 경로 테스트는 실제 런타임 호출 경로를 spy/mock 합니다.
	- 예: `window.localStorage`를 교체한 테스트에서는 `Storage.prototype`이 아니라 교체 객체를 spy 합니다.
- React `key` 동작은 DOM 속성 조회로 검증하지 않습니다.
	- 노드 재생성 여부(참조 변경)와 결과 상태(`scrollTop` 등)로 검증합니다.
- 목 데이터는 타입 계약을 지킵니다.
	- 필수 필드(`topLevel`, `updatedAt` 등) 누락 금지

### 권장 패턴

- 사용자 인터랙션은 `userEvent`를 사용합니다.
- 비동기 렌더링/상태 변경은 `waitFor` 또는 `findBy...`로 안정적으로 기다립니다.
- `IntersectionObserver`/`ResizeObserver`/`window.open` 같은 브라우저 API는 `vitest.setup.ts`에서 공통 mock을 사용합니다.
