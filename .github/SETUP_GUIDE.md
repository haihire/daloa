# GitHub 운영 설정 가이드

이 가이드는 로컬 테스트 기준과 GitHub Actions를 동기화하고, main 보호를 활성화하는 단계별 절차입니다.

---

## 1단계: 워크플로 준비 확인

다음 파일들이 이미 생성되어 있는지 확인하세요:

- `.github/workflows/pr-ci.yml` - PR 머지 전 검증 (필수)
- `.github/workflows/server-e2e.yml` - 서버 E2E 테스트 (선택, main/수동 실행)
- `.github/workflows/main-post-merge.yml` - main 머지 후 후속 작업 (선택)
- `.github/pull_request_template.md` - PR 템플릿
- `.github/BRANCH_PROTECTION_CHECKLIST.md` - 보호 규칙 참조표

이들을 git에 커밋하세요:

```bash
git add .github/
git commit -m "feat: github actions ci/cd 설정"
git push origin main
```

---

## 2단계: Branch Protection 규칙 생성

GitHub 웹에서 다음 순서대로 진행하세요:

### 위치

1. Repository 페이지 > Settings 탭 클릭
2. 좌측 메뉴 > Branches 클릭
3. "Add rule" 버튼 클릭

### 설정값 입력

| 항목                                                | 값                     | 필수 |
| --------------------------------------------------- | ---------------------- | ---- |
| Branch name pattern                                 | `main`                 | 필수 |
| Require a pull request before merging               | ON                     | 필수 |
| Require approvals                                   | 1                      | 필수 |
| Dismiss stale approvals when new commits are pushed | ON                     | 필수 |
| Require status checks to pass before merging        | ON                     | 필수 |
| Required checks                                     | `PR CI / quality-gate` | 필수 |
| Require branches to be up to date before merging    | ON                     | 필수 |
| Require conversation resolution before merging      | ON                     | 필수 |
| Require linear history                              | ON                     | 권장 |
| Do not allow bypassing the above settings           | ON                     | 필수 |

### 상세 클릭 가이드

**Require status checks to pass before merging** 체크 후:

- "Add checks" 검색창에서 `quality-gate` 입력
- `PR CI / quality-gate` 항목 클릭해서 선택

**Create** 버튼으로 규칙 저장

---

## 3단계: GitHub Actions 자동화 테스트

### 첫 PR 생성으로 CI 검증

```bash
# feature 브랜치 생성
git checkout -b feature/test-ci

# 간단한 변경 (예: README 공백 추가)
echo "" >> README.md
git add README.md
git commit -m "test: ci workflow"
git push origin feature/test-ci
```

GitHub 웹에서 Pull Request를 생성하면:

1. PR 열 때 "PR CI / quality-gate" 체크가 시작됨
2. 약 3~5분 후 client lint, server lint, 테스트, 빌드 완료
3. 모두 통과하면 "All checks passed" 표시
4. 그제서야 "Merge pull request" 버튼 활성화

### 브랜치 보호 확인

- PR을 직접 main에 머지하려 하면 오류 (Branch Protection 작동)
- PR 승인/체크 통과 후에만 Squash & merge 가능

---

## 4단계: 주간 운영 루틴 설정

### 추천 구성

| 시점            | 작업        | 명령어                                                                 |
| --------------- | ----------- | ---------------------------------------------------------------------- |
| PR 생성 시      | 자동 검증   | GitHub Actions 자동 실행                    |
| main 머지 후    | 배포 트리거 | `.github/workflows/main-post-merge.yml`     |
| 주 1회 (금요일) | E2E 전체    | GitHub Actions 수동 실행                    |

### Server E2E 수동 실행 (필요 시)

GitHub 웹에서:

1. Actions 탭 > "Server E2E" workflow
2. "Run workflow" 드롭다운 > Run workflow 클릭
3. 약 2~3분 후 완료

---

## 5단계: 배포 설정 (선택)

`.github/workflows/main-post-merge.yml`에서 "Deploy trigger (placeholder)" 부분을 실제 배포 로직으로 교체하세요:

### 옵션 1: SSH 배포 (EC2)

```yaml
- name: Deploy to EC2
  uses: appleboy/ssh-action@v1.0.0
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ${{ secrets.DEPLOY_USER }}
    key: ${{ secrets.DEPLOY_KEY }}
    script: |
      cd /home/deploy/app
      git pull origin main
      npm install
      npm run build
      pm2 restart app
```

### 옵션 2: GitHub Pages (정적 배포)

```yaml
- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./client/out
```

### 옵션 3: Docker + Cloud Run

```yaml
- name: Deploy to Cloud Run
  uses: google-github-actions/deploy-cloudrun@v1
  with:
    service: lomoa-api
    region: asia-northeast1
    image: gcr.io/${{ secrets.GCP_PROJECT }}/lomoa:${{ github.sha }}
```

필요한 환경변수/시크릿은 Repository Settings > Secrets and variables > Actions 에서 추가하세요.

---

## 6단계: 홈 캐시 워밍 (외부 업타임 핑거)

### 왜 필요한가

홈(`/`)은 정적 ISR(`revalidate=600`)이라 평소엔 서울 엣지 캐시 HTML을 즉시 줘서 TTFB가 수십 ms입니다.
하지만 **트래픽이 적은 시간대**엔 캐시가 만료·축출(evict)되고, 그 직후 첫 방문자가 페이지를
**동기로 새로 생성**(Vercel 서버리스 콜드스타트 + 렌더)하게 돼 TTFB가 **7~10초**까지 튑니다.

`prewarm-home.yml`은 **프로덕션 배포 직후 딱 1번**만 데우므로, 배포가 없는 날엔 평상시 캐시를
지켜주지 못합니다. → **외부 핑거로 홈을 주기적으로 호출**해 캐시 항목을 항상 살아있게 유지하면,
재생성 비용을 실제 사용자가 아닌 봇이 대신 치릅니다.

### 설정 (UptimeRobot 기준, 무료)

1. <https://uptimerobot.com> 가입 (무료 플랜이면 충분)
2. **Add New Monitor** 클릭
3. 다음 값 입력:

   | 항목              | 값                                    |
   | ----------------- | ------------------------------------- |
   | Monitor Type      | `HTTP(s)`                             |
   | Friendly Name     | `lomoa home warm`                     |
   | URL               | `https://www.lomoa.kr/`               |
   | Monitoring Interval | `5 minutes` (무료 최소값)            |

4. **Create Monitor** 저장. 이후 5분마다 홈을 호출해 ISR 캐시를 데웁니다.
5. (선택) **My Settings > Alert Contacts**에 이메일을 등록하면 다운 시 알림도 받습니다.

> **대안:** <https://cron-job.org> (무료, **1분 간격** 가능). URL `https://www.lomoa.kr/`,
> 스케줄을 매 1~3분으로 설정하면 워밍이 더 촘촘해집니다. UptimeRobot은 모니터링 알림이 덤,
> cron-job.org는 더 짧은 간격이 장점.

### 확인

설정 후 관리자 > 모니터링 > "메인페이지 로딩 속도 추이"에서 TTFB 스파이크(7~10s)가
사라지는지 며칠 관찰하세요. 봇 호출이라 EC2/Actions 부하는 사실상 0입니다.

---

## troubleshooting

### "PR CI / quality-gate" 체크가 보이지 않음

워크플로가 아직 한 번도 실행되지 않은 상태입니다. 첫 PR을 열면 자동으로 나타납니다.

### Required checks 선택 시 "No checks found"

워크플로를 GitHub에 push한 후 처음 PR을 열어야 체크 목록이 생성됩니다.

### E2E 테스트 실패

DB/Redis 환경 점검하세요.

---

## 체크리스트

- [ ] `.github/workflows/*.yml` 파일들 main에 커밋
- [ ] GitHub Settings > Branches > Branch Protection rule 생성
- [ ] Required checks에 `PR CI / quality-gate` 추가
- [ ] 첫 feature 브랜치에서 PR 생성해 워크플로 동작 확인
- [ ] main 보호 규칙 적용 확인 (직접 푸시 시 오류)
- [ ] 배포 로직 필요 시 main-post-merge.yml 수정
- [ ] 외부 업타임 핑거(UptimeRobot 등)로 홈 캐시 워밍 모니터 등록 (6단계)
