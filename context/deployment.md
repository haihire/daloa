# 배포 방법

---

## 1. 서버 (EC2 배포)

### 사전 조건

- AWS EC2 인스턴스 (Ubuntu)
- Docker + Docker Compose 설치됨
- SSH 키 파일: `daloa-key.pem`
- EC2 IP: `3.39.239.9`
- Let's Encrypt SSL 인증서 발급 완료 (`api.daloa.kr`)

### 1-1. SSH 접속

```powershell
ssh -i "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem" ubuntu@3.39.239.9
```

### 1-2. 코드 업데이트 + 빌드 + 재시작

```bash
# EC2 서버 안에서 실행
cd daloa

# 최신 코드 가져오기
git pull

# NestJS 빌드 (EC2에서 직접 — Docker 내 메모리 절약)
cd server
npm run build

# Docker 컨테이너 재빌드 + 재시작 (--build 필수 — 없으면 이전 이미지 재사용)
cd ..
docker compose up -d --build nest
```

### 1-3. 원커맨드 배포 (로컬에서)

```powershell
ssh -i "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem" -o StrictHostKeyChecking=no ubuntu@3.39.239.9 "cd daloa && git pull && cd server && npm run build 2>&1 | tail -3 && cd .. && docker compose up -d --build nest 2>&1 | tail -3"
```

### 1-4. 전체 서비스 재시작 (MySQL, Redis, Nginx 포함)

```bash
# EC2 안에서 (mysql, nginx는 production profile)
cd daloa
docker compose --profile production down
docker compose --profile production up -d
```

### 1-6. EC2 환경변수(.env) 수정

> ⚠️ Docker는 `/home/ubuntu/daloa/.env`를 읽음. `server/.env`는 로컬 개발용이며 EC2 Docker는 읽지 않는다.

```bash
# EC2 접속 후 직접 편집
nano /home/ubuntu/daloa/.env

# 수정 후 nest 컨테이너 재시작 (--build 필수)
cd daloa && docker compose up -d --build nest
```

로컬에서 SCP로 덮어쓸 경우 **반드시 `/home/ubuntu/daloa/.env`** 경로로 전송:

```powershell
# 단, EC2 전용 키/비밀번호가 포함된 EC2 .env를 로컬에서 덮어쓰지 않도록 주의
scp -i "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem" .env ubuntu@3.39.239.9:/home/ubuntu/daloa/.env
```

### 1-5. 로그 확인

```bash
# NestJS 컨테이너 로그
docker logs daloa-nest --tail 50

# Nginx 로그
docker logs daloa-nginx --tail 50

# Redis 로그
docker logs daloa-redis --tail 50
```

---

## 2. 클라이언트 (Vercel 배포)

### 사전 조건

- Vercel 계정에 GitHub 리포지토리 연결됨
- Root Directory: `client` 설정
- Framework Preset: `Next.js`

### 2-1. 자동 배포

**`main` 브랜치에 push하면 Vercel이 자동으로 빌드 + 배포한다.**

```powershell
git add .
git commit -m "변경 내용"
git push origin main
```

→ Vercel 대시보드에서 빌드 진행 상태 확인 가능

### 2-2. Vercel 환경변수

Vercel 프로젝트 Settings → Environment Variables에 설정:

| 변수명                     | 환경           | 값                       |
| -------------------------- | -------------- | ------------------------ |
| `NEST_API_URL`             | All            | `https://api.daloa.kr`   |
| `NEXT_PUBLIC_NEST_API_URL` | Production     | `https://api.daloa.kr`   |

- `NEST_API_URL` — SSR fetch 시 서버에서 사용 (`page.tsx`의 `process.env.NEST_API_URL`)
- `NEXT_PUBLIC_NEST_API_URL` — 클라이언트 컴포넌트에서 사용

### 2-3. 프리뷰 배포

- `main` 이외 브랜치에 push하면 프리뷰 URL이 자동 생성됨
- PR에서 프리뷰 확인 후 머지

---

## 3. 크롤러 (EC2 수동 실행)

```bash
# EC2 안에서
cd daloa/crawlers
python3 crawl_rank.py
```

- 로그는 `crawlers/logs/crawl-YYYY-MM-DD_HH-MM-SS.log`에 저장
- 크론잡으로 자동화하려면:
  ```bash
  # 매일 04:00 KST 실행 (UTC 19:00)
  crontab -e
  0 19 * * * cd /home/ubuntu/daloa/crawlers && python3 crawl_rank.py >> /dev/null 2>&1
  ```

---

## 4. 도메인 (가비아 DNS)

| 도메인         | 타입  | 값                     | 용도                |
| -------------- | ----- | ---------------------- | ------------------- |
| `daloa.kr`     | CNAME | `cname.vercel-dns.com` | 클라이언트 (Vercel) |
| `api.daloa.kr` | A     | `3.39.239.9`           | 서버 API (EC2)      |

### 도메인 변경 시

1. 가비아 DNS 관리 → 레코드 수정
2. EC2 IP가 바뀌면 `api.daloa.kr` A 레코드 업데이트
3. Vercel 도메인 설정에서 `daloa.kr` 확인

---

## 5. SSL 인증서 (Let's Encrypt)

```bash
# EC2 안에서 — 최초 발급
sudo certbot certonly --standalone -d api.daloa.kr

# 자동 갱신 확인
sudo certbot renew --dry-run
```

- 인증서 경로: `/etc/letsencrypt/live/api.daloa.kr/`
- Nginx 컨테이너가 해당 경로를 읽기 전용 마운트
- 갱신 후 Nginx 재시작: `docker restart daloa-nginx`

---

## 6. DB 관리

### 스키마 초기화

```bash
# EC2 안에서 — MySQL 컨테이너 최초 기동 시 자동 실행
# scripts/init-db.sql → docker-entrypoint-initdb.d/01-schema.sql
# scripts/dump.sql    → docker-entrypoint-initdb.d/02-data.sql
```

### 수동 덤프 (로컬 → EC2)

```bash
# 로컬에서 덤프 생성
node scripts/dump-db.js

# EC2로 전송
scp -i "daloa-key.pem" scripts/dump.sql ubuntu@3.39.239.9:~/daloa/scripts/
```

### DB 데이터 수동 수정 (SQL 파일 실행)

> ⚠️ mysql 실행 시 반드시 `--default-character-set=utf8mb4` 옵션을 붙여야 한글이 깨지지 않는다.

```powershell
# 1. 로컬에서 SQL 파일 작성 후 EC2로 전송
scp -i "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem" fix.sql ubuntu@3.39.239.9:/tmp/fix.sql

# 2. EC2 MySQL 컨테이너에서 실행
ssh -i "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem" -o StrictHostKeyChecking=no ubuntu@3.39.239.9 \
  "docker exec -i daloa-mysql mysql -udaloa -p1234 --default-character-set=utf8mb4 lost_ark < /tmp/fix.sql"

# 3. 관련 Redis 캐시 삭제 (예: sites)
ssh -i "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem" -o StrictHostKeyChecking=no ubuntu@3.39.239.9 \
  "docker exec daloa-redis redis-cli -a Redis9999! DEL sites:all"
```

---

## 7. 빠른 참조 — 배포 체크리스트

> **배포 스크립트를 사용하면 캐시 삭제를 자동으로 처리한다.**

### 서버만 변경했을 때

```powershell
# 스크립트 사용 (권장 — dist/ 삭제 포함)
powershell -File scripts/deploy.ps1

# Redis 캐시도 날리려면
powershell -File scripts/deploy.ps1 -FlushRedis
```

### 클라이언트만 변경했을 때

```powershell
git push origin main
# → Vercel 자동 배포 (.next 캐시는 Vercel이 관리)
```

### 둘 다 변경했을 때

```powershell
# 1) push (Vercel 자동 배포)
git push origin main

# 2) EC2 서버 배포 (캐시 삭제 포함)
powershell -File scripts/deploy.ps1
```

### 전체 서비스 재시작 (MySQL/Redis/Nginx 포함)

```powershell
powershell -File scripts/deploy.ps1 -Full
```

### Vercel이 옛날 데이터를 보여줄 때 (캐시 강제 갱신)

```powershell
git commit --allow-empty -m "chore: 재배포"; git push origin main
```
