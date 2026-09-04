# GitHub Actions 워크플로우 설명

이 디렉터리의 각 `*.yml` 워크플로우가 **무엇을, 언제, 왜** 실행하는지 정리한 문서다.
전체 CI/CD·브랜치 흐름은 [../CI_CD_FLOW.md](../CI_CD_FLOW.md) 참고.

## 한눈에 보기

| 워크플로우 | 트리거 | 분류 | 역할 |
| ---------- | ------ | ---- | ---- |
| [pr-ci.yml](pr-ci.yml) | PR (base ≠ main) | CI | 변경분 lint·test·build·E2E → `quality-gate` 집계 |
| [auto-delete-branch.yml](auto-delete-branch.yml) | PR closed(merged) | 정리 | 머지된 하위 브랜치 자동 삭제(상위 제외) |

### 삭제된 워크플로우 (2026-09-04)

사이트를 정적으로 전환하고 EC2를 없애면서, EC2·모니터링 DB에 의존하던 다음 워크플로우를 지웠다.
남겨두면 main에 푸시할 때마다 존재하지 않는 인스턴스에 배포를 시도해 실패한다.

| 워크플로우 | 지운 이유 |
| ---------- | --------- |
| `main-post-merge.yml` | 서버 이미지를 ECR에 올려 EC2에 SSM 배포했다. 배포 대상이 사라졌다. |
| `vercel-deploy-log.yml` | 배포 시점을 `api.lomoa.kr`의 모니터링 DB에 기록했다. 그 엔드포인트가 없어져 `curl -fsS`가 매번 실패한다. |
| `prewarm-home.yml` | 홈의 ISR 엣지 캐시를 데웠다. 홈이 빌드 시점에 완성되는 정적 페이지가 되어 데울 캐시가 없다. |
| `db-migrate.yml` | EC2 postgres에 SQL을 실행했다. DB가 사라졌다. |
| `diag-nest.yml` | EC2 NestJS 컨테이너 상태를 조회했다. 컨테이너가 사라졌다. |

`server/` 코드를 리포에서 내리면서 `server-e2e.yml`도 함께 지웠다. `pr-ci.yml`은 남겨두지만
`server/**` paths-filter가 더는 매칭되지 않아 client 잡만 실행된다.

---

## CI

### pr-ci.yml — PR CI (핵심 게이트)
- **트리거**: `pull_request`, `branches-ignore: [main]` → **base가 main이 아닌 모든 PR** (즉 하위→상위 PR)
- **동작**:
  - `changes` 잡이 paths-filter로 `server/**`·`client/**` 변경 여부 감지 → **바뀐 쪽 잡만 실행**
  - 잡: `server`(lint+test+build), `integration`(PostgreSQL), `e2e`(PostgreSQL+Redis), `client`(lint+test+build)
  - `quality-gate` 잡이 위 잡들을 `needs`로 묶어 **단일 통과 기준** 제공
- **왜 main 제외?** 상위→main 머지는 이미 하위→상위 단계에서 검증됐으므로 다시 돌리지 않는다.

## 배포

배포 전용 워크플로우는 없다. Vercel이 GitHub 연동으로 `main` 푸시를 감지해 직접 빌드·배포한다.
전 페이지가 정적 프리렌더라 배포 후 캐시 워밍이나 서버 재시작 같은 후속 작업이 필요 없다.

## 정리 / 문서 / 운영

### auto-delete-branch.yml — 머지 후 브랜치 삭제
- **트리거**: PR이 **merged** 상태로 close될 때
- **동작**: head 브랜치가 상위(`main`,`admin`,`mainPage`,`etc`)면 보존, 그 외(하위 작업 브랜치)는 자동 삭제. ref가 이미 없어도 실패하지 않게 멱등 처리.
