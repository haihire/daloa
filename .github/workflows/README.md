# GitHub Actions 워크플로우 설명

이 디렉터리의 각 `*.yml` 워크플로우가 **무엇을, 언제, 왜** 실행하는지 정리한 문서다.
전체 CI/CD·브랜치 흐름은 [../CI_CD_FLOW.md](../CI_CD_FLOW.md) 참고.

## 한눈에 보기

| 워크플로우 | 트리거 | 분류 | 역할 |
| ---------- | ------ | ---- | ---- |
| [pr-ci.yml](pr-ci.yml) | PR (base ≠ main) | CI | 변경분 lint·test·build·E2E → `quality-gate` 집계 |
| [main-post-merge.yml](main-post-merge.yml) | push → main (`server/**`,`client/**`) | 배포 | 서버 이미지 빌드→ECR→EC2 배포(SSM) |
| [vercel-deploy-log.yml](vercel-deploy-log.yml) | `deployment_status` (Vercel) | 기록 | next(프론트) 배포 시점을 모니터링 DB에 기록 |
| [prewarm-home.yml](prewarm-home.yml) | `deployment_status` / 수동 | 성능 | 배포 직후 홈(`/`) ISR 엣지 캐시 1회 워밍 |
| [auto-delete-branch.yml](auto-delete-branch.yml) | PR closed(merged) | 정리 | 머지된 하위 브랜치 자동 삭제(상위 제외) |
| [drawio-export.yml](drawio-export.yml) | push → main (`docs/architecture.drawio`) / 수동 | 문서 | drawio → SVG 변환 후 PR 생성 |
| [db-migrate.yml](db-migrate.yml) | 수동(`workflow_dispatch`) | 운영 | EC2 postgres에 SQL 마이그레이션 실행 |
| [diag-nest.yml](diag-nest.yml) | 수동(`workflow_dispatch`) | 운영 | EC2 NestJS 컨테이너 상태·로그 조회 |
| [server-e2e.yml](server-e2e.yml) | 수동(`workflow_dispatch`) | CI(예비) | E2E 단독 재현용 수동 fallback |

---

## CI

### pr-ci.yml — PR CI (핵심 게이트)
- **트리거**: `pull_request`, `branches-ignore: [main]` → **base가 main이 아닌 모든 PR** (즉 하위→상위 PR)
- **동작**:
  - `changes` 잡이 paths-filter로 `server/**`·`client/**` 변경 여부 감지 → **바뀐 쪽 잡만 실행**
  - 잡: `server`(lint+test+build), `integration`(PostgreSQL), `e2e`(PostgreSQL+Redis), `client`(lint+test+build)
  - `quality-gate` 잡이 위 잡들을 `needs`로 묶어 **단일 통과 기준** 제공
- **왜 main 제외?** 상위→main 머지는 이미 하위→상위 단계에서 검증됐으므로 다시 돌리지 않는다.

### server-e2e.yml — Server E2E (Manual)
- **트리거**: 수동 전용
- **동작**: PostgreSQL·Redis 서비스 컨테이너 띄우고 `npm run test:e2e` 실행
- **위치**: PR 자동 E2E는 pr-ci.yml에 통합됨. 이 파일은 **회귀 재현·단독 디버깅용 수동 fallback**으로만 유지.

---

## 배포 / 배포 후속

### main-post-merge.yml — 서버 배포
- **트리거**: `main`에 push되고 `server/**` 또는 `client/**` 변경 시 (+ 수동)
- **동작**:
  1. 서버 빌드(`npm ci` → `npm run build`)
  2. `./server` Docker 이미지 빌드 → **ECR push** (태그 = commit SHA)
  3. **SSM**으로 EC2에 접속해 `git pull` + `.env` 갱신 + 이미지 pull + `docker compose --profile production up -d` + nginx 재시작
  4. (선택) 헬스체크, 배포 이벤트(`service:nest`)를 모니터링 DB에 기록
- 자세한 배포 파일 구성은 [../CI_CD_FLOW.md](../CI_CD_FLOW.md)의 "EC2에 올라가는 것" 참고.

### vercel-deploy-log.yml — Vercel(next) 배포 기록
- **트리거**: `deployment_status` (Vercel Git 연동이 production 배포 완료 시 발생)
- **동작**: production 성공 시 `POST /api/webhooks/deploy`로 `service:next` 배포 시점을 `container_events` 테이블에 기록 (Vercel 유료 웹훅 불필요)

### prewarm-home.yml — 홈 캐시 워밍
- **트리거**: `deployment_status`(Vercel production 성공) / 수동
- **동작**: 배포 직후 홈(`/`)을 봇으로 호출해 **ISR 엣지 캐시를 1회 데움** → 첫 사용자가 cold/stale 응답을 안 만나게.
- **주의**: 상시 크론이 아니라 배포 직후 1회. 평상시 캐시 유지는 외부 업타임 핑거(UptimeRobot/cron-job.org) 별도 운영.

---

## 정리 / 문서 / 운영

### auto-delete-branch.yml — 머지 후 브랜치 삭제
- **트리거**: PR이 **merged** 상태로 close될 때
- **동작**: head 브랜치가 상위(`main`,`admin`,`mainPage`,`etc`)면 보존, 그 외(하위 작업 브랜치)는 자동 삭제. ref가 이미 없어도 실패하지 않게 멱등 처리.

### drawio-export.yml — 아키텍처 다이어그램 export
- **트리거**: `main`에 `docs/architecture.drawio` 변경 push (+ 수동)
- **동작**: drawio → SVG 변환 + prettify 후 `docs/architecture.svg` 갱신 PR 자동 생성.

### db-migrate.yml — DB 마이그레이션 (수동)
- **트리거**: 수동. 입력 `sql_file`(레포 루트 기준 경로), `restart_nest`(기본 true)
- **동작**: SSM으로 EC2에서 `git pull` 후 해당 SQL을 `lomoa-postgres` 컨테이너에 주입. 옵션 시 nest 재시작.
- **사용 예**: `gh workflow run db-migrate.yml -f sql_file=db/migrations/004_xxx.sql`

### diag-nest.yml — NestJS 진단 (수동)
- **트리거**: 수동. 입력 `tail`(로그 라인 수, 기본 100)
- **동작**: SSM으로 EC2의 `docker compose ps` + nest 컨테이너 로그를 조회해 출력.
