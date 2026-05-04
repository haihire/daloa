# scripts 폴더 가이드

이 폴더는 로컬 개발, 테스트, 배포, DB 시드/동기화용 스크립트를 모아둔 곳입니다.

## 가장 자주 쓰는 스크립트

### 1) 개발 서버 띄우기

- 파일: `dev.ps1`
- 용도: 서버(3001) + 클라이언트(3000) 실행, 포트 정리, 로그 파일 생성
- 실행:

```powershell
powershell -File scripts/dev.ps1
```

### 2) 테스트 한 번에 실행

- 파일: `test.ps1`
- 용도: 서버 단위 테스트 + 클라이언트 테스트 (+ 옵션으로 E2E)
- 실행:

```powershell
powershell -File scripts/test.ps1
powershell -File scripts/test.ps1 -Coverage
powershell -File scripts/test.ps1 -E2E
```

### 3) EC2 배포

- 파일: `deploy.ps1`
- 용도: EC2에서 git pull -> 빌드 -> Docker 재시작
- 실행:

```powershell
powershell -File scripts/deploy.ps1
powershell -File scripts/deploy.ps1 -Full
powershell -File scripts/deploy.ps1 -FlushRedis
```

## 파일별 상세 설명

### PowerShell

- `cleanup-logs.ps1`
  - 역할: `server/logs`, `client/logs`, `crawlers/logs`에서 오래된 `.log` 삭제
  - 기본 보관일: 30일 (`-Days`로 변경 가능)

- `dev.ps1`
  - 역할: 개발 시작 스크립트
  - 동작: 로그 정리 -> 포트 점유 프로세스 종료 -> 서버/클라이언트 실행

- `test.ps1`
  - 역할: 테스트 오케스트레이터
  - 동작: 서버 테스트 -> 클라이언트 테스트 -> (옵션) 서버 E2E

- `deploy.ps1`
  - 역할: EC2 배포 스크립트
  - 동작: `server/dist` 정리, 서버 빌드, Docker 재기동, 선택적으로 Redis flush

- `seed-sites.ps1`
  - 역할: 사이트 목록 시드 실행 래퍼
  - 동작: `server/.env.local`에서 DB 환경변수 로드 후 `seed_sites.mjs` 실행

### SQL

- `init-db.sql`
  - 역할: 로컬 DB 초기화(테이블 생성 + 초기 데이터 일부 삽입)
  - 용도: 초기 세팅할 때 1회 실행

- `sync-sites.sql`
  - 역할: `loa_sites`를 기준 목록(`desired_sites`)과 강제 동기화
  - 특징: 기준에 없는 사이트는 DELETE 됨

- `dump.sql`
  - 역할: DB 덤프 결과 파일(생성 산출물)
  - 생성 주체: `dump-db.js`

### Node.js / MJS

- `dump-db.js`
  - 역할: 현재 로컬 MySQL 데이터를 `dump.sql`로 덤프

- `seed_sites.mjs`
  - 역할: `loa_sites` 테이블 생성/업서트 시드

- `seed_expedition.mjs`
  - 역할: 특정 원정대 캐릭터 데이터를 Lost Ark API에서 조회해 `loa_users` 업서트
  - 주의: 특정 캐릭터/API 키/로컬 DB 접속값에 강하게 의존하는 수동 운영 스크립트

## 보조 파일

- `package.json`, `package-lock.json`
  - scripts 폴더 내 Node 스크립트(`dump-db.js`, `*.mjs`) 실행에 필요한 의존성 정의

- `node_modules/`
  - scripts 전용 의존성 설치 결과물

## 언제 어떤 스크립트를 쓰면 되나

- 로컬 개발 시작: `dev.ps1`
- PR 전 빠른 검증: `test.ps1`
- 서버 반영: `deploy.ps1`
- 사이트 목록 DB 반영:
  1. `seed_sites.mjs` 수정
  2. `seed-sites.ps1` 실행
  3. Redis 키 `sites:all` 삭제
- DB를 새로 구성: `init-db.sql`
- 사이트 목록을 기준 목록과 완전 일치: `sync-sites.sql`

## 참고

- `sync-sites.sql`은 삭제(DELETE)까지 수행하므로 운영 DB에 적용 시 반드시 백업 후 실행하세요.
- 한글 포함 SQL은 UTF-8(BOM 없음), 실행 시 문자셋은 `utf8mb4`를 사용하세요.
