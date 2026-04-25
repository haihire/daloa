# main 브랜치 보호 권장 체크 항목

아래 표 그대로 GitHub Settings > Branches > Branch protection rules 에서 설정하면 됩니다.

| 항목                                                | 권장값                 | 이유                                |
| --------------------------------------------------- | ---------------------- | ----------------------------------- |
| Branch name pattern                                 | `main`                 | 운영 브랜치 보호 대상 고정          |
| Require a pull request before merging               | ON                     | 직접 푸시 방지, 변경 이력 표준화    |
| Require approvals                                   | 1                      | self-review라도 승인 흐름 유지      |
| Dismiss stale approvals when new commits are pushed | ON                     | 변경 후 재검토 강제                 |
| Require review from Code Owners                     | OFF (선택)             | 1인 개발 시 과도한 제약 방지        |
| Require status checks to pass before merging        | ON                     | CI 품질 게이트                      |
| Required checks                                     | `PR CI / quality-gate` | 최소 검증 세트를 단일 기준으로 고정 |
| Require branches to be up to date before merging    | ON                     | main 최신 반영 강제                 |
| Require conversation resolution before merging      | ON                     | 미해결 코멘트 방지                  |
| Require signed commits                              | OFF (선택)             | 필요 시만 적용                      |
| Require linear history                              | ON (권장)              | 이력 단순화                         |
| Allow force pushes                                  | OFF                    | 이력 파손 방지                      |
| Allow deletions                                     | OFF                    | 브랜치 삭제 방지                    |
| Do not allow bypassing the above settings           | ON                     | 관리자 포함 규칙 일관 적용          |

## 함께 쓰는 운영 규칙

- main 직접 푸시 금지 (PR 머지로만 반영)
- 머지 방식은 Squash 권장
- 브랜치 이름 규칙:
  - feature/이슈번호-기능명
  - hotfix/이슈번호-내용

## 테스트 운영 기준

| 검증 항목                            | 실행 위치                                          | 필수 여부 | 비고                             |
| ------------------------------------ | -------------------------------------------------- | --------- | -------------------------------- |
| client lint                          | PR CI                                              | 필수      | main 머지 전 자동 검증           |
| server lint                          | PR CI                                              | 필수      | main 머지 전 자동 검증           |
| 서버 단위 테스트 + 클라이언트 테스트 | [../scripts/test.ps1](../scripts/test.ps1) + PR CI | 필수      | 로컬과 CI가 같은 하네스 사용     |
| client build                         | PR CI                                              | 필수      | 배포 전 빌드 가능 여부 확인      |
| server build                         | PR CI                                              | 필수      | Nest 빌드 깨짐 방지              |
| server E2E                           | Server E2E workflow                                | 선택      | main 반영 후 또는 수동 실행 권장 |
