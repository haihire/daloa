# deploy.ps1 — EC2 서버 배포 (캐시 삭제 + 빌드 + 재시작)
# 사용: powershell -File scripts/deploy.ps1
# 효과: git pull → dist 삭제 → npm run build → Docker 재빌드 → Redis 캐시 플러시

param(
    [string]$KeyPath = "C:\Users\tjdtn\Desktop\내가생각하는미래\개발\로아사이트 모음\daloa-key.pem",
    [string]$Host    = "ubuntu@3.39.239.9",
    [switch]$FlushRedis,    # -FlushRedis 시 Redis 캐시 전체 삭제
    [switch]$Full           # -Full 시 MySQL/Nginx 포함 전체 재시작
)

Write-Host ""
Write-Host "========================================"
Write-Host "  EC2 서버 배포"
Write-Host "========================================"
Write-Host ""

# ─── 배포 명령 조립 ───
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
    $commands += "echo '[추가] Redis 캐시 플러시...' && docker exec daloa-redis redis-cli -a `$REDIS_PASSWORD FLUSHALL 2>&1"
}

$commands += "echo '' && echo '배포 완료' && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -10"

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
