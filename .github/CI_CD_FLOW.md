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

배포 경로는 **Vercel 하나뿐이다.** 2026-09-04 정적 전환으로 EC2·ECR·SSM 경로를 전부 없앴다.

```
main 머지
  │
  └─ Vercel(GitHub 연동)이 감지 → next build → 프로덕션 배포
```

전 페이지가 빌드 시점에 완성되는 정적 프리렌더(`○ Static`)라, 배포 후 캐시 워밍이나
컨테이너 재시작 같은 후속 작업이 없다. GitHub Actions에 배포용 워크플로우도 없다.

### 사이트 목록을 바꾸려면

사이트 데이터는 DB가 아니라 리포에 있다.

1. `client/data/sites.json` 수정
2. 커밋 → PR → main 머지
3. Vercel이 자동 배포

### 이전 구조 (2026-09-04 이전)

백엔드(nest)를 EC2에서 돌리고 `main-post-merge.yml`이 ECR 이미지를 빌드해 SSM으로 배포했다.
홈은 그 API를 ISR로 불러왔는데, 트래픽이 적어 엣지 캐시가 축출되면 첫 방문자가 콜드 생성
(TTFB 7~10초)을 뒤집어썼고 API가 느리면 함수 한도를 넘겨 5xx까지 났다. 운영 비용을 없애면서
데이터를 리포에 넣는 방식으로 바꿔 이 실패 모드를 통째로 제거했다.

관련 코드(NestJS 백엔드, admin 페이지, API 라우트, admin 인증 미들웨어)는 배포에 쓰이지 않아
리포에서 내렸다. git 히스토리에 남아 있으므로 `git checkout <sha> -- server/` 식으로 꺼낼 수 있다.

---

## 5. 운영

수동 운영 워크플로우(`db-migrate.yml`, `diag-nest.yml`)는 대상 EC2·DB가 없어져 함께 삭제했다.
현재 남은 워크플로우는 [workflows/README.md](workflows/README.md) 참고.
