# 테스트 하네스 규칙

---

## 0. 하네스 엔지니어링 워크플로우 (기본 순서)

> **모든 개발/수정/디버깅 세션은 이 순서를 따른다.**

### 단계 0 — 브랜치 생성 및 PR

**모든 기능 추가·버그 수정은 반드시 브랜치를 만들고 PR을 통해 `main`에 머지한다.**  
`main` 직접 커밋·직접 머지 금지 — PR을 거쳐야 GitHub Actions(`pr-check.yml`)가 실행된다.

```powershell
# 1) 항상 최신 main 기준으로 브랜치 생성
git checkout main
git pull origin main
git checkout -b feature/기능명     # 새 기능(UI/API, 사이트 추가 포함)
git checkout -b fix/버그명         # 버그 수정
git checkout -b hotfix/긴급수정명  # 배포 장애 긴급 수정
git checkout -b chore/작업명       # 설정·문서·스크립트 변경
git checkout -b refactor/리팩터링명 # 동작 변경 없는 코드 정리
```

**브랜치 네이밍 규칙**

| 접두사      | 사용 상황                    | 예시                          |
| ----------- | ---------------------------- | ----------------------------- |
| `feature/`  | 새 기능(UI/API, 사이트 추가) | `feature/site-bookmark`       |
| `fix/`      | 버그 수정                    | `fix/redis-cache-broken-text` |
| `hotfix/`   | 배포된 서비스 긴급 수정      | `hotfix/prod-login-error`     |
| `chore/`    | 설정·스크립트·문서 변경      | `chore/add-cleanup-logs`      |
| `refactor/` | 동작 변경 없는 코드 정리     | `refactor/sites-service`      |

```powershell
# 2) 작업 완료 후 브랜치 푸시 → GitHub에서 PR 생성
git add .
git commit -m "feature(범위): 설명"
git push origin feature/기능명
# → GitHub에서 PR 열기 → pr-check.yml 통과 확인 → Merge

# 3) 머지 후 로컬 정리
git checkout main
git pull origin main
git branch -d feature/기능명
```

**에이전트 작업 규칙 (필수)**

- 파일 수정이 필요한 요청이면, 작업 전에 에이전트가 브랜치 유형을 먼저 추천한다.
- 추천 형식: `추천 브랜치: feature/...` + 이유 1줄.
- 사용자 확인(승인) 후에만 실제 파일 수정/커밋 절차를 진행한다.
- 기준:
  - `feature/` — 새 사이트 추가, 새 기능(UI/API)
  - `fix/` — 버그, 한글 깨짐, 로직 오류
  - `hotfix/` — 배포된 서비스 긴급 수정만
  - `refactor/` — 코드 정리, 타입 개선
  - `chore/` — CI 세팅, 문서 업데이트

> **주의**: `git merge` 로컬 직접 머지 후 `push origin main` 방식은 `pr-check.yml`이 트리거되지 않는다.

### 단계 1 — 환경 시작

```powershell
# 루트 디렉터리에서:
powershell -File scripts/dev.ps1
```

- 포트 3001(서버), 3000(클라이언트)을 점유 중인 프로세스를 **먼저 종료**한 뒤 재시작
- 서버/클라이언트 각각 **새 창**에서 실행, 로그를 `server/logs/`, `client/logs/`에 저장
- 포트 변경이 필요하면: `powershell -File scripts/dev.ps1 -ServerPort 3002 -ClientPort 3001`
- **자동 로그 정리**: dev.ps1은 시작 시 30일 이상 경과한 로그를 자동으로 삭제함

#### 로그 수동 정리 (필요 시)

특정 기간의 로그만 유지하려면:

```powershell
# 7일 이상 경과한 로그 모두 삭제 (상세 출력)
powershell -File scripts/cleanup-logs.ps1 -Days 7 -Verbose

# 기본값 (30일)
powershell -File scripts/cleanup-logs.ps1
```

- `cleanup-logs.ps1`은 `server/logs/`, `client/logs/`, `crawlers/logs/` 의 `*.log` 파일을 정리한다
- Git에서는 모든 로그 파일(`.gitignore`에 `server/logs/`, `client/logs/` 포함)이 제외되어 있으므로 안전하다

### 단계 2 — 로그 분석

시작 직후 오류가 의심될 때는 로그 파일을 확인한다:

```powershell
# 서버 오늘치 실행/콘솔 로그 (dev.ps1가 stdout+stderr를 함께 append)
Get-Content server\logs\app-$(Get-Date -Format 'yyyy-MM-dd').log -Tail 50

# 클라이언트 오늘치 실행/콘솔 로그 (dev.ps1가 stdout+stderr를 함께 append)
Get-Content client\logs\app-$(Get-Date -Format 'yyyy-MM-dd').log -Tail 50

# 서버 애플리케이션 내부 에러 로그 (FileLoggerService가 기록)
Get-Content server\logs\error-$(Get-Date -Format 'yyyy-MM-dd').log -Tail 50

# 클라이언트 애플리케이션 내부 에러 로그 (instrumentation.ts가 기록)
Get-Content client\logs\error-$(Get-Date -Format 'yyyy-MM-dd').log -Tail 50
```

- `scripts/dev.ps1`는 현재 표준출력 + 표준에러를 합쳐 `app-YYYY-MM-DD.log`에 누적한다.
- `error-YYYY-MM-DD.log`는 별도 애플리케이션 로거가 기록한 에러 전용 파일이며, 모든 콘솔 stderr가 자동 분리 저장되는 것은 아니다.

- 오류 발견 시: 원인 파악 → 코드 수정 → 단계 3으로 이동
- 오류 없으면: 단계 3으로 바로 이동

### 단계 3 — 테스트 실행 및 통과

```powershell
# 기본 (단위 테스트만)
powershell -File scripts/test.ps1

# 커버리지 포함
powershell -File scripts/test.ps1 -Coverage

# E2E 포함
powershell -File scripts/test.ps1 -E2E
```

- 실패 시: 오류 메시지 분석 → 코드 수정 → **테스트가 전부 통과할 때까지 반복**
- `[PASS]` 전부 확인 후에만 작업 완료로 간주

### 단계 4 — 기록

- 새로 발견한 버그·설계 변경 → `record.md` 작성 (섹션 7-1 형식)
- 기능 추가·스키마 변경 → `기획.md` 업데이트
- AI 대화 중 발견한 문제도 세션 종료 전에 `record.md`에 기록

---

## 실행 명령어 (빠른 참조)

```bash
# 서버 — 단위 테스트 (Jest)
cd server && npm test

# 서버 — 커버리지 포함
cd server && npm run test:cov

# 서버 — E2E (docker-compose up -d 선행 필요)
cd server && npm run test:e2e

# 클라이언트 — 컴포넌트 테스트 (Vitest)
cd client && npm test

# 클라이언트 — 커버리지 포함
cd client && npm run test:coverage
```

---

## 1. 폴더 구조 규칙

### 1-1. 서버 (NestJS) 모듈 구조

각 **feature** 디렉터리(`characters/`, `sites/`, `users/` 등)는 다음 파일들을 포함한다:

```
server/src/[feature]/
  [feature].controller.ts      — HTTP 엔드포인트 정의
  [feature].service.ts         — 비즈니스 로직 (순수 함수 export)
  [feature].module.ts          — NestJS 모듈 (DI 설정)
  [feature].service.spec.ts    — 단위 테스트 (Jest)
```

**공용 모듈**:

- `common/` — 에러 필터, 인터셉터, 데코레이터
- `db/` — 데이터베이스 풀 관리
- `redis/` — Redis 클라이언트 관리
- `kakao/` / `lostark/` — 외부 API 통합

### 1-2. 클라이언트 (Next.js) 폴더 구조

```
client/app/
  layout.tsx          — 루트 레이아웃 (HTML 마크업, 전역 CSS)
  page.tsx            — 메인 페이지 컴포넌트
  sitemap.ts          — SEO 사이트맵
  globals.css         — 테일윈드 전역 스타일

client/components/
  [feature]/
    [Feature].tsx     — 컴포넌트 (PascalCase)
    [Feature].test.tsx — 테스트 (같은 폴더)

client/types/
  index.ts            — 전역 타입 정의 (Site, Character 등)

client/public/
  favicon.ico, icon.png 등
```

### 1-3. 테스트 파일 위치

| 레이어              | 테스트 파일 위치                     | 패턴                           |
| ------------------- | ------------------------------------ | ------------------------------ |
| 서버 단위           | `server/src/**/*.spec.ts`            | 테스트 대상과 같은 폴더에 위치 |
| 서버 E2E            | `server/test/*.e2e-spec.ts`          | 격리된 `test/` 폴더            |
| 클라이언트 컴포넌트 | `client/components/**/*.test.tsx`    | 컴포넌트와 같은 폴더에 위치    |
| 클라이언트 유틸/훅  | `client/[utils\|hooks]/**/*.test.ts` | 대상과 같은 폴더               |

---

## 2. 서버 단위 테스트 규칙 (Jest + NestJS Testing)

### Mock 원칙

- **DB(`DB_POOL`)**: `{ execute: jest.fn() }` 으로 목 처리, 실 DB 연결 금지
- **Redis(`REDIS_CLIENT`)**: `{ get, set, del }` 메서드만 목 처리
- **외부 서비스(KakaoService 등)**: `Partial<Service>` 타입으로 필요한 메서드만 목 처리
- `beforeEach` 에서 매 테스트마다 목을 초기화

```ts
// 올바른 목 구성 예시
beforeEach(async () => {
  mockPool = { execute: jest.fn() };
  mockRedis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MyService,
      { provide: DB_POOL, useValue: mockPool },
      { provide: REDIS_CLIENT, useValue: mockRedis },
    ],
  }).compile();
});
```

### 순수 함수 테스트

- 비즈니스 로직을 담은 순수 함수는 `export` 한 뒤 독립적으로 단위 테스트
- 경계값(0, 최솟값, 최댓값)과 분기 조건을 모두 케이스로 작성

### 금지 사항

- `it` 안에서 실제 네트워크/DB/Redis 호출 금지
- `setTimeout`, `setInterval` 등 타이머를 테스트 내에서 직접 실행 금지 → `jest.useFakeTimers()` 사용
- 테스트 간 상태 공유 금지 (`let` 변수는 반드시 `beforeEach` 에서 초기화)

---

## 3. 서버 E2E 테스트 규칙 (Supertest)

- 실행 전 `docker-compose up -d` 로 MariaDB + Redis 기동 확인
- `beforeAll` 에서 앱 기동, `afterAll` 에서 `app.close()` 호출 필수
- HTTP 상태 코드 + 응답 구조(배열 여부, 필드 존재 여부)까지 검증
- 민감한 데이터(비밀번호, 토큰)는 응답에 포함되지 않는지 확인

```ts
it("GET /api/sites → 200 + 배열", () => {
  return request(app.getHttpServer())
    .get("/api/sites")
    .expect(200)
    .expect((res) => {
      expect(Array.isArray(res.body)).toBe(true);
    });
});
```

---

## 4. 클라이언트 컴포넌트 테스트 규칙 (Vitest + Testing Library)

### 렌더링 검증

- `screen.getByText`, `screen.getByRole` 등 **접근성 쿼리**를 우선 사용
- `alt=""` 인 장식용 이미지는 접근성 트리에서 숨겨지므로 `container.querySelector('img')` 로 조회

### 사용자 인터랙션

- 클릭/키보드는 `userEvent`(비동기) 사용, `fireEvent` 직접 사용 지양
- `window.open`, `fetch` 등 전역 함수는 `vi.spyOn` 으로 목 처리 후 테스트 종료 시 반드시 `mockRestore()`

```ts
it('클릭 시 window.open 호출', async () => {
  const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(<MyComponent />);
  await userEvent.click(screen.getByRole('button'));
  expect(spy).toHaveBeenCalledOnce();
  spy.mockRestore(); // 반드시 복구
});
```

### 엣지 케이스 필수 작성

- 빈 배열(`[]`) props 전달 시 렌더링 오류 없는지 확인
- Optional props(`icon?`, `description?`) 누락 시 동작 확인

### 테스트 신뢰도 체크리스트 (필수)

- 테스트 이름과 assertion은 반드시 1:1로 대응한다.
  - 예: "로딩 메시지 표시" 테스트에서 컨테이너 존재만 확인하지 말고, 실제 로딩 텍스트(`불러오는 중…`)를 검증한다.
- 인덱스 기반 선택(`getAllByRole(...)[1]`)을 지양하고, 역할/이름/레이블 기반 선택을 사용한다.
  - 예: `getByRole('button', { name: /다음/i })`, `button[aria-label*="즐겨찾기"]`
- 예외 경로 테스트는 실제 런타임 호출 경로를 스파이/목한다.
  - `window.localStorage`를 교체한 경우 `Storage.prototype`이 아니라 교체된 객체 메서드를 스파이한다.
- React `key` 관련 동작은 DOM attribute 조회로 검증하지 않는다.
  - `key`는 DOM에 노출되지 않으므로, 재마운트 여부(노드 참조 변경)와 결과 상태(`scrollTop` 초기화 등)로 검증한다.
- 목 데이터는 타입 계약을 준수한다.
  - 테스트가 통과해도 필수 필드 누락(예: `topLevel`, `updatedAt`)은 허용하지 않는다.

### 유틸리티 & 훅 테스트

- 순수 함수(데이터 변환, 포맷팅 등)는 독립적으로 단위 테스트
- React 훅은 `renderHook` (Vitest)으로 테스트

```ts
// 유틸리티 테스트
import { formatNumber } from "@/utils/format";

it('formatNumber(1000000) → "1,000,000"', () => {
  expect(formatNumber(1000000)).toBe("1,000,000");
});

// 훅 테스트 (있을 경우)
import { renderHook, act } from "@testing-library/react";
import { useCounter } from "@/hooks/useCounter";

it("카운터 증가", () => {
  const { result } = renderHook(() => useCounter());
  act(() => result.current.increment());
  expect(result.current.count).toBe(1);
});
```

### 금지 사항

- 구현 세부사항(클래스명, DOM 구조) 기반 쿼리 금지 → `getByRole`, `getByText` 사용
- 스냅샷 테스트 단독 사용 금지 — 의도를 담은 assertion과 함께 작성

---

## 5. 커버리지 목표

| 레이어                          | 목표            |
| ------------------------------- | --------------- |
| 서버 서비스(\*.service.ts)      | **80% 이상**    |
| 서버 컨트롤러(\*.controller.ts) | E2E로 대체 허용 |
| 클라이언트 컴포넌트             | **70% 이상**    |

---

## 6. CI 통합 원칙

- PR 머지 전 `npm test` 통과 필수
- 커버리지가 목표치 미달이면 머지 차단
- E2E는 별도 `test:e2e` 스크립트로 분리하여 선택적으로 실행

---

## 6-1. 환경변수 관리

### .env 파일 구조

각 환경마다 별도의 `.env` 파일을 관리한다. `.gitignore` 에 포함되어야 한다.

**서버** (`server/.env` 또는 `server/.env.local`):

```env
# 기본
PORT=3001
CLIENT_ORIGIN=http://localhost:3000

# 데이터베이스
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=lost_ark
DB_USER=root
DB_PASS=1234

# 외부 API
LOSTARK_API_KEY=...
YOUTUBE_API_KEY=...
KAKAO_REST_API_KEY=...

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
```

**클라이언트** (`client/.env.local`):

```env
# 개발 환경
NEXT_PUBLIC_API_URL=http://localhost:3001

# 배포 환경 (production)
# NEXT_PUBLIC_API_URL=https://api.daloa.kr
```

### 환경별 설정 방법

| 환경         | 위치                | 방법                                      |
| ------------ | ------------------- | ----------------------------------------- |
| 로컬 개발    | `server/.env.local` | `npm run start:dev` (자동 로드)           |
| 로컬 dev.ps1 | Docker Compose 환경 | 컨테이너 시작 전 `.env` 복사              |
| EC2 배포     | EC2 서버의 `.env`   | SSH 접근 후 수동 설정 또는 GitHub Secrets |

### 금지 사항

- **절대로** `.env` 파일을 git에 커밋하지 말 것
- 민감한 정보(API 키, DB 비밀번호)를 코드 또는 로그에 노출하지 말 것
- 환경변수는 런타임에 읽을 것 — 빌드 타임에 하드코딩하지 말 것

---

## 7. 개발 기록 문서 규칙

이 프로젝트는 테스트 코드 외에 아래 3가지 문서를 함께 관리한다.
테스트에서 발견한 버그·설계 문제·기술 결정도 해당 문서에 반드시 기록한다.

---

### 7-1. `record.md` — 고민한 문제와 해결 과정

**위치**: 프로젝트 루트 `record.md`

**언제 작성하는가**

- 버그를 발견하고 원인 파악 및 수정까지 완료했을 때
- 설계를 바꾸거나 로직을 크게 수정했을 때
- 테스트를 작성하다가 기존 코드의 문제점을 발견했을 때
- **Copilot(AI)과의 대화 중 발견한 버그·설계 개선·해결 과정** — 대화 세션이 끝나기 전에 기록

**작성 형식**

```markdown
## 문제 N. [한 줄 요약]

**문제**
어떤 상황에서 무슨 증상이 발생했는지 서술. (재현 조건 포함)

**고민**

- 어떤 해결 방향들을 고려했는지
- 각 방향의 트레이드오프

**해결**
실제로 선택한 방법과 구체적인 변경사항 서술.
코드가 핵심이면 코드 블록 포함.

**결과**
수치나 비교표로 개선 효과를 명시. 정성적 효과도 기술.
```

**규칙**

- 섹션은 `# 클라이언트 / 서버 개발`, `# 크롤러 개발` 등 영역별로 구분
- 문제 번호는 같은 섹션 내에서 순차 증가
- 해결 전 상태와 해결 후 상태를 반드시 대비해서 기술
- "왜 그렇게 했는가"를 중심으로 서술 — 코드만 붙여넣는 기록 금지

---

### 7-2. `기획.md` — 기능 아이디어와 방향 업데이트

**위치**: 프로젝트 루트 `기획.md`

**언제 작성하는가**

- 새로운 기능 아이디어가 생겼을 때
- 기존 기획이 구현 과정에서 변경되었을 때
- DB 스키마·API 구조·UI 레이아웃 결정이 바뀌었을 때
- 테스트 작성 중 API 계약(응답 형태)이 변경될 때

**작성 형식**

기획.md는 자유 형식이지만 아래 구성을 유지한다.

```
# 목적
사이트가 존재하는 이유 (변하지 않는 핵심)

# 클라이언트
UI 레이아웃과 기능 목록. 완료된 항목은 ~~취소선~~으로 표시.

# DB
테이블 스키마 요약. 컬럼 추가/변경 시 즉시 반영.

# 서버
설계 원칙, 캐싱 전략, 에러 처리 방침.

# 미결 과제 (선택)
아직 결정되지 않은 항목.
```

**규칙**

- 삭제하지 않고 ~~취소선~~으로 히스토리를 남긴다
- DB 스키마는 기획.md가 항상 최신 상태여야 한다 — 코드보다 짧게 요약해서 기록
- "언젠가 하면 좋겠다" 아이디어는 `# 미결 과제` 섹션에 분류

---

### 7-3. `technicalRead/` — 기술 학습 노트

**위치**: 프로젝트 루트 `technicalRead/` 폴더

**언제 작성하는가**

- 개발 중 처음 접한 기술 개념을 정리할 때
- 공식 문서나 블로그 내용을 내 언어로 재해석했을 때
- 테스트 작성 중 이해한 동작 원리(Mock, DI, 비동기 등)를 기록할 때

**파일 명명 규칙**

```
technicalRead/
  ES6문제.md          ← CJS vs ESM, NestJS와의 충돌 원리
  Thing.md            ← 개발 환경 구성 고민 (Docker 분리 전략 등)
  Jest목킹원리.md      ← Jest Mock / Spy / Stub 동작 원리  ← 신규 작성 예시
  Redis캐싱전략.md     ← Redis TTL, 캐시 무효화 패턴       ← 신규 작성 예시
```

- 파일명은 **주제를 한눈에 알 수 있는 한국어** 사용 (영어 고유명사는 그대로)
- 하나의 파일에 한 가지 주제만 담는다

**작성 형식**

```markdown
# [주제명]

## 왜 이걸 알아야 했나

이 기술을 조사하게 된 배경 (개발 중 만난 문제와 연결)

## 핵심 개념

개념 설명. 비유나 예시 코드 포함.

## 이 프로젝트에서의 적용

실제로 어떻게 사용했는지 code snippet 또는 파일 경로 참조.

## 참고

링크 또는 관련 diary.md 문제 번호
```

**규칙**

- 복사·붙여넣기 정리 금지 — 반드시 내 언어로 재해석한 내용만 기록
- "이 프로젝트에서의 적용" 섹션이 없으면 추상적인 메모에 그치므로 반드시 포함
- 주제가 diary.md 의 문제 해결 과정과 연결된다면 `참고` 에 해당 문제 번호를 명시
