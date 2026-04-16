# deploy.ps1 — EC2 서버 배포 (캐시 삭제 + 빌드 + 재시작)
# 사용: powershell -File scripts/deploy.ps1
# 효과: git pull → dist 삭제 → npm run build → Docker 재빌드 → Redis 캐시 플러시

param(
    [string]$KeyPath   = "C:\Users\tjdtn\Desktop\ingit\daloa\daloa-key.pem",
    [string]$Host      = "ubuntu@3.39.239.9",
    [switch]$FlushRedis,    # -FlushRedis 시 Redis 캐시 전체 삭제
    [switch]$Full,          # -Full 시 MySQL/Nginx 포함 전체 재시작
    [string]$SqlFile        # -SqlFile fix.sql 시 DB 업데이트 + 관련 캐시 삭제 + 워밍업
)

Write-Host ""
Write-Host "========================================"

# ─── DB 업데이트 모드 ───
if ($SqlFile) {
    Write-Host "  EC2 DB 업데이트"
    Write-Host "========================================"
    Write-Host ""

    if (-not (Test-Path $SqlFile)) {
        Write-Host "[오류] SQL 파일을 찾을 수 없습니다: $SqlFile"
        exit 1
    }

    Write-Host "[1/3] SQL 파일 EC2 전송..."
    scp -i $KeyPath -o StrictHostKeyChecking=no $SqlFile "${Host}:/tmp/deploy-fix.sql"
    if ($LASTEXITCODE -ne 0) { Write-Host "[오류] SCP 실패"; exit 1 }

    Write-Host "[2/3] MySQL 실행..."
    ssh -i $KeyPath -o StrictHostKeyChecking=no $Host `
        "docker exec -i daloa-mysql mysql -udaloa -p1234 --default-character-set=utf8mb4 lost_ark < /tmp/deploy-fix.sql && echo 'SQL OK' && rm /tmp/deploy-fix.sql"
    if ($LASTEXITCODE -ne 0) { Write-Host "[오류] SQL 실행 실패"; exit 1 }

    Write-Host "[3/3] Redis 캐시 삭제 + 워밍업..."
    ssh -i $KeyPath -o StrictHostKeyChecking=no $Host @"
docker exec daloa-redis redis-cli -a Redis9999! DEL sites:all 2>/dev/null
echo '[캐시] sites:all 삭제 완료'
docker exec daloa-nest wget -qO- http://localhost:3001/api/sites > /dev/null && echo '[워밍업] sites 캐시 재생성 완료'
"@

    Write-Host ""
    Write-Host "[deploy] DB 업데이트 + 캐시 워밍업 완료"
    Write-Host "========================================"
    Write-Host ""
    exit 0
}

Write-Host "  EC2 서버 배포"
Write-Host "========================================"
Write-Host ""

# ─── 서버 배포 명령 조립 ───
$commands = @(
    "cd daloa"
    "echo '[1/4] git pull...' && git pull"
    "echo '[2/4] 캐시 삭제 (dist/)...' && rm -rf server/dist"
    "echo '[3/4] NestJS 빌드...' && cd server && npm run build 2>&1 | tail -5 && cd .."
)

if ($Full) {
    $commands += "echo '[4/4] 전체 재시작 (production)...' && docker compose --profile production down && docker compose --profile production up -d --build 2>&1 | tail -5"
} else {
    $commands += "echo '[4/4] NestJS 컨테이너 재시작...' && docker compose up -d --build nest 2>&1 | tail -5"
}

if ($FlushRedis) {
    $commands += "echo '[추가] Redis 캐시 플러시...' && docker exec daloa-redis redis-cli -a Redis9999! FLUSHALL 2>&1"
    $commands += "echo '[워밍업] 캐시 재생성 중...' && sleep 2 && docker exec daloa-nest wget -qO- http://localhost:3001/api/sites > /dev/null && echo '[워밍업] sites OK'"
}

$commands += "echo '' && echo '배포 완료' && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

$remoteCmd = $commands -join " && "

Write-Host "[deploy] SSH 접속 + 배포 시작..."
Write-Host ""

ssh -i $KeyPath -o StrictHostKeyChecking=no $Host $remoteCmd

$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "[deploy] 배포 성공"
} else {
    Write-Host "[deploy] 배포 실패 (exit code: $exitCode)"
}
Write-Host "========================================"
Write-Host ""

exit $exitCode
