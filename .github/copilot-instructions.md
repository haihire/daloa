# 프로젝트 Copilot 지침

테스트·문서 작성 규칙 전체는 [`HARNESS.md`](../HARNESS.md)를 따른다.  
프로젝트 컨텍스트(구조·스키마·API·환경변수·Redis) 전체는 [`context/INDEX.md`](../context/INDEX.md)에서 목차로 접근한다.

---

## 프로젝트 구조

- **서버**: `server/` — NestJS + MariaDB + Redis (포트 3001)
- **클라이언트**: `client/` — Next.js 15 App Router (포트 3000)
- **크롤러**: `crawlers/` — Python (curl_cffi + asyncio)

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

1. `powershell -File scripts/dev.ps1` — 포트 정리 후 서버·클라이언트 재시작, 로그 기록
2. `server/logs/`, `client/logs/` 에서 에러 로그 확인 → 원인 수정
3. `powershell -File scripts/test.ps1` — 전체 테스트 실행
4. `[PASS]` 전부 확인 후 작업 완료로 간주
5. 새로 발견한 버그·설계 변경은 `record.md`에 기록

---

## 테스트 작성 규칙 (요약)

> 상세 규칙: `HARNESS.md` 섹션 1~6

- 서버 단위 테스트: `server/src/**/*.spec.ts`, DB·Redis·외부 서비스는 반드시 목(mock) 처리
- 서버 E2E: `server/test/*.e2e-spec.ts`, Supertest 사용
- 클라이언트 컴포넌트 테스트: `client/components/**/*.test.tsx`, Vitest + Testing Library
- `it` 안에서 실제 DB·Redis·네트워크 호출 절대 금지
- `vi.spyOn` / `jest.fn()` 사용 후 반드시 `mockRestore()` 또는 `beforeEach` 초기화

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
