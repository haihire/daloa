# 프로젝트 Copilot 지침

테스트·문서 작성 규칙 전체는 [`HARNESS.md`](../HARNESS.md)를 따른다.  
프로젝트 컨텍스트(구조·스키마·API·환경변수·Redis) 전체는 [`context/INDEX.md`](../context/INDEX.md)에서 목차로 접근한다.

---

## 프로젝트 구조

- **서버**: `server/` — NestJS + MariaDB + Redis (포트 3001)
  - 각 feature 모듈: `src/[feature]/{service, controller, module, spec}.ts`
  - 공용 모듈: `common/`, `db/`, `redis/`, `kakao/`, `lostark/`
- **클라이언트**: `client/` — Next.js 15 App Router (포트 3000)
  - 라우팅: `app/` (layout.tsx, page.tsx, sitemap.ts)
  - 컴포넌트: `components/[feature]/[Feature].tsx + .test.tsx`
  - 타입: `types/index.ts`
- **크롤러**: `crawlers/` — Python (curl_cffi + asyncio)
- **웹서버**: `nginx/` — Nginx 설정 (SSL, 프록시)

---

## 컨텍스트 파일 (코드 작업 전 관련 파일 먼저 읽기)

| 작업 유형                | 읽어야 할 컨텍스트                                              |
| ------------------------ | --------------------------------------------------------------- |
| 새 기능 추가 / 모듈 연결 | [`context/architecture.md`](../context/architecture.md)         |
| 쿼리 작성 / 스키마 변경  | [`context/db-schema.md`](../context/db-schema.md)               |
| API 호출 / 컨트롤러 수정 | [`context/api-contracts.md`](../context/api-contracts.md)       |
| 환경변수 추가            | [`context/env-config.md`](../context/env-config.md)             |
| Redis 관련 서비스 수정   | [`context/redis-keys.md`](../context/redis-keys.md)             |
| 폴더 구조 / 파일 위치    | [`context/folder-structure.md`](../context/folder-structure.md) |
| 배포 / 인프라 변경       | [`context/deployment.md`](../context/deployment.md)             |

---

## 하네스 엔지니어링 워크플로우 (기본 순서)

> 상세 규칙: `HARNESS.md` 섹션 0

0. **브랜치 + PR 필수** — `main` 직접 커밋·직접 머지 절대 금지. 반드시 브랜치를 만들고 PR을 통해 머지한다 (PR이 있어야 `pr-check.yml` Actions가 실행됨).
   ```powershell
   git checkout main ; git pull origin main
   git checkout -b feat/기능명   # 또는 fix/, chore/, refactor/
   # 작업 후:
   git push origin feat/기능명
   # → GitHub에서 PR 생성 → Actions 통과 → Merge
   git checkout main ; git pull origin main ; git branch -d feat/기능명
   ```
1. `powershell -File scripts/dev.ps1` — 포트 정리 후 서버·클라이언트 재시작, 로그 기록
2. `server/logs/`, `client/logs/` 에서 먼저 오늘치 `app-*.log`를 확인하고, 필요 시 `error-*.log`까지 함께 확인 → 원인 수정
3. `powershell -File scripts/test.ps1` — 전체 테스트 실행
4. `[PASS]` 전부 확인 후 작업 완료로 간주
5. 새로 발견한 버그·설계 변경은 `record.md`에 기록

- 에러 체크/디버깅 시에는 테스트 출력만 보지 말고, 관련 시점의 로그 파일을 먼저 확인해 원인을 좁힌다.
- `scripts/dev.ps1`가 남기는 실행/콘솔 로그는 `app-YYYY-MM-DD.log`, 애플리케이션 내부 에러 전용 로그는 `error-YYYY-MM-DD.log`로 구분한다.

---

## 테스트 작성 규칙 (요약)

> 상세 규칙: `HARNESS.md` 섹션 1~6

- 서버 단위 테스트: `server/src/**/*.spec.ts`, DB·Redis·외부 서비스는 반드시 목(mock) 처리
- 서버 E2E: `server/test/*.e2e-spec.ts`, Supertest 사용
- 클라이언트 컴포넌트 테스트: `client/components/**/*.test.tsx`, Vitest + Testing Library
- 클라이언트 유틸/훅 테스트: `client/[utils|hooks]/**/*.test.ts` (독립 단위 테스트)
- `it` 안에서 실제 DB·Redis·네트워크 호출 절대 금지
- `vi.spyOn` / `jest.fn()` 사용 후 반드시 `mockRestore()` 또는 `beforeEach` 초기화

---

## 환경변수 관리

> 상세 규칙: `HARNESS.md` 섹션 6-1

- **서버**: `server/.env.local` — DB, API 키, Redis 연결 정보
- **클라이언트**: `client/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:3001` (개발)
- **절대 금지**: 민감한 정보를 코드·로그·git에 노출하지 말 것
- **배포**: EC2에서는 `.env`를 수동 설정하거나 GitHub Secrets 사용

---

## 개발 기록 문서 규칙 (요약)

> 상세 규칙: `HARNESS.md` 섹션 7

- 버그 수정·설계 변경 → `record.md`에 문제/고민/해결/결과 형식으로 기록
- 기능 아이디어·DB 스키마 변경 → `기획.md` 업데이트 (삭제 대신 ~~취소선~~ 사용)
- 기술 개념 정리 → `technicalRead/[주제명].md` 신규 파일 생성

---

## 코드 스타일

- TypeScript strict 모드 준수
- NestJS는 `CommonJS` 빌드 (`module: "commonjs"`) — ESM 전환은 NestJS v12 이후 검토
- 서비스 로직의 순수 함수는 `export` 하여 단위 테스트 가능하게 유지
- 환경변수는 `.env` 파일 사용, `.gitignore`에 포함 (`node_modules`, `.env` 커밋 금지)

---

## DB 한글 깨짐 방지 (필독)

> 상세 절차: [`context/deployment.md`](../context/deployment.md) 섹션 6

DB 스키마 변경·데이터 수정·배포 시 **반드시** 아래를 지킨다:

1. **수동 SQL 실행** — 항상 `--default-character-set=utf8mb4` 옵션 사용
2. **SQL 파일** — 반드시 UTF-8(BOM 없음)로 저장 후 실행
3. **UPDATE 기준 컬럼** — 한글이 깨질 수 있는 `name` 대신 `href`(URL) 등 ASCII 컬럼으로 WHERE 조건 작성
4. **PowerShell 한글 입력** — `chcp 65001` 설정 후 실행하거나 UTF-8 `.sql` 파일로 실행
5. **배포 후** — 깨진 행 탐지 쿼리로 점검 (`deployment.md` 참조)

---

## 사이트 모음 추가 규칙 (필독)

`scripts/sync-sites.sql`의 `desired_sites`에 새 사이트를 추가할 때 **반드시** 아래를 따른다:

1. **설명 직접 조회** — 해당 사이트(URL)를 fetch_webpage 등으로 직접 방문해 실제 기능을 확인한 뒤 설명을 작성한다. 추측으로 쓰지 않는다.
2. **두 줄 제한** — `description`은 카드 UI 기준 **두 줄을 넘지 않도록** 작성한다. 기존 항목의 글자 수(한글 20자 내외)를 참고한다.
3. **기능 나열 형식** — 여러 기능이 있으면 `A·B·C` 또는 `A, B 등 툴 제공` 형식으로 압축한다.
4. **`SITE_TEXT_CANONICAL` 등록** — 한글이 포함된 `name`/`description`을 가진 사이트는 `server/src/sites/sites.service.ts`의 `SITE_TEXT_CANONICAL`에도 추가한다 (깨짐 자동 복구용).

**설명 작성 예시**

| 나쁜 예                                                             | 좋은 예                                           |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `재련·경매·치명타 계산기, 음돌 계산기, 일정 관리 등 다양한 툴 제공` | `재련·경매·치명타 계산기, 음돌 계산기 등 통합 툴` |
| `로스트아크 관련 다양한 정보와 커뮤니티 기능을 제공하는 사이트`     | `로아 커뮤니티`                                   |

**사이트 추가 후 DB 반영 순서 (필수)**

아래 순서를 반드시 실행한다. 누락 시 서버가 오래된 캐시를 계속 반환한다.

```powershell
# 1) seed_sites.mjs 수정 후 DB에 반영
powershell -File scripts/seed-sites.ps1

# 2) Redis 캐시 무효화 — 서버 실행 중이든 아니든 항상 실행
redis-cli DEL sites:all
```

- 2번을 건너뛰면 서버 Redis 캐시(TTL 10분)가 만료될 때까지 변경 내용이 반영되지 않는다.
- 서버가 꺼져 있어도 `redis-cli DEL sites:all`은 실행해야 한다 (재시작 시 캐시 재사용 방지).
