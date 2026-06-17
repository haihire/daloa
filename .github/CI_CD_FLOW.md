# CI/CD · 브랜치 · 배포 전체 흐름

이 레포의 브랜치 전략, CI 게이트, 배포 파이프라인을 한 문서로 정리한다.
개별 워크플로우 설명은 [workflows/README.md](workflows/README.md) 참고.

---

## 1. 브랜치 전략

```
하위(작업) 브랜치  ──PR──▶  상위 브랜치  ──PR──▶  main  ──▶  배포
   feat/xxx                  admin 등                운영
```

- **상위 브랜치**는 고정이 아니라 작업 주제별로 그때그때 생성·변경된다 (예: `admin`, `mainPage`, `etc`).
- **하위 브랜치**는 상위에서 따서 작업하고, 끝나면 상위로 PR 머지한다. (`feat/내용`, `fix/내용`, `chore/내용`)
- 상위 브랜치는 검증 후 `main`으로 PR 머지한다.
- 머지 방식은 **Squash 권장**.

### 규칙
- `main` **직접 push 금지** (PR 머지로만 반영)
- 머지된 하위 브랜치는 [auto-delete-branch.yml](workflows/auto-delete-branch.yml)가 자동 삭제 (상위 브랜치는 보존)

---

## 2. 브랜치 보호 (Rulesets)

GitHub **Settings > Rules > Rulesets** 기준. (구 Branch protection rules 아님)

### main ruleset
| 항목 | 설정 | 이유 |
| ---- | ---- | ---- |
| Require a pull request before merging | ON | PR로만 반영 |
| Block force pushes | ON | 이력 파손 방지 |
| Restrict deletions | ON | main 삭제 방지 |
| Require status checks (quality-gate) | **OFF** | 상위→main엔 불필요 (하위→상위서 이미 검증) |
| Bypass list | 본인 / **Allow for pull requests only** | 직접 push는 막고 PR 머지만 허용 |

> **핵심**: main에는 status check를 걸지 않는다. `quality-gate`는 **하위→상위 단계에서만** 동작하도록 의도한 구조다.

### 상위 브랜치
- 상위 브랜치가 가변이라 ruleset 목록으로 강제(머지 차단)하지 **않는다**.
- 대신 CI(`quality-gate`)가 **모든 비-main PR에서 자동 실행**되므로, 결과를 보고 머지한다 (1인 개발 기준).
- 하드 게이트가 필요해지면, 그때 상위 브랜치를 대상으로 하는 ruleset에 `PR CI / quality-gate`를 required check로 추가.

---

## 3. CI 흐름 (quality-gate)

[pr-ci.yml](workflows/pr-ci.yml) — 트리거: `pull_request`, `branches-ignore: [main]`

```
하위 → 상위 PR 생성
   │
   ├─ changes      : server/client 변경 경로 감지 (paths-filter)
   ├─ server       : lint + test + build      (server 변경 시)
   ├─ integration  : 통합 테스트 (PostgreSQL)  (server 변경 시)
   ├─ e2e          : E2E (PostgreSQL + Redis)  (server 변경 시)
   ├─ client       : lint + test + build       (client 변경 시)
   └─ quality-gate : 위 잡 전체 통과 집계 (단일 기준)
```

- **base가 main이 아닌 모든 PR**에서 실행 → 하위→상위 PR에서 자동 동작
- **상위→main PR에서는 미실행** (위 main ruleset과 일치)
- **변경된 경로만** 검사 (server만 바뀌면 client 잡은 스킵)

---

## 4. 배포 흐름

배포는 **백엔드(nest, EC2)** 와 **프론트(next, Vercel)** 두 경로로 나뉜다.

### 4-1. 백엔드 — EC2 (nest)
[main-post-merge.yml](workflows/main-post-merge.yml) — 트리거: `main` push + `server/**`·`client/**` 변경

```
main 머지
  │
  ├─ 1. server 빌드 (npm ci → npm run build)
  ├─ 2. ./server Docker 이미지 빌드 → ECR push (태그 = commit SHA)
  ├─ 3. SSM으로 EC2 접속:
  │       git pull origin main         (레포 설정 파일 동기화)
  │       .env 갱신 (NEST_IMAGE 등)
  │       docker pull <ECR 이미지>
  │       docker compose --profile production up -d
  │       docker restart lomoa-nginx
  └─ 4. (선택) 헬스체크 + 배포 이벤트 기록(service:nest)
```

#### EC2에 올라가는 것
| 경로 | 전달 방식 | 내용 |
| ---- | --------- | ---- |
| 서버 코드(nest) | ECR 이미지 pull | `dist/`, `generated/`, prod 의존성 (Dockerfile 기준) |
| 인프라/설정 | `git pull origin main` | `docker-compose.yml`, `nginx/`, `site-finder/`, `db/` |
| 시크릿 | SSM이 `.env`에 주입 | 이미지 태그, 토큰류 |

> EC2의 `git pull`은 레포 전체를 체크아웃하므로, 불필요한 파일(README/docs/client/server 소스 등)을 빼려면 EC2에서 **sparse-checkout**으로 `docker-compose.yml`,`nginx/`,`site-finder/`,`db/`만 남기면 된다. (`server/`는 ECR 이미지를 쓰므로 불필요)

### 4-2. 프론트 — Vercel (next)
- Vercel **Git 연동**이 `main` 변경을 감지해 자동 배포 (이 레포 워크플로우 아님).
- 배포 완료 시 GitHub `deployment_status` 이벤트가 발생하고, 이를 받아:
  - [vercel-deploy-log.yml](workflows/vercel-deploy-log.yml): next 배포 시점을 모니터링 DB(`container_events`)에 기록
  - [prewarm-home.yml](workflows/prewarm-home.yml): 홈(`/`) ISR 엣지 캐시를 1회 워밍

---

## 5. 운영 (수동 워크플로우)

| 작업 | 워크플로우 | 실행 |
| ---- | ---------- | ---- |
| DB 마이그레이션 | [db-migrate.yml](workflows/db-migrate.yml) | `gh workflow run db-migrate.yml -f sql_file=db/migrations/xxx.sql` |
| NestJS 상태·로그 진단 | [diag-nest.yml](workflows/diag-nest.yml) | Actions 탭 > Run workflow |
| E2E 단독 재현 | [server-e2e.yml](workflows/server-e2e.yml) | Actions 탭 > Run workflow |

---

## 6. 홈 캐시 상시 워밍 (외부 핑거)

홈(`/`)은 정적 ISR(`revalidate=600`)이라 트래픽이 적은 시간대엔 엣지 캐시가 만료·축출되어,
직후 첫 방문자의 TTFB가 7~10초까지 튄다. [prewarm-home.yml](workflows/prewarm-home.yml)은
**배포 직후 1회**만 데우므로, 배포 없는 날의 상시 캐시는 외부 업타임 핑거로 유지한다.

- **UptimeRobot**(무료, 5분 간격): `HTTP(s)` 모니터, URL `https://www.lomoa.kr/` → 다운 알림 덤
- **cron-job.org**(무료, 1분 간격 가능): 더 촘촘한 워밍이 필요할 때

확인: 관리자 > 모니터링 > "메인페이지 로딩 속도 추이"에서 TTFB 스파이크가 사라지는지 관찰.
