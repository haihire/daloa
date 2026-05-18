# deploy.ps1 — EC2 서버 배포 (캐시 삭제 + 빌드 + Nest/Nginx 재시작)
# 사용: powershell -File scripts/deploy.ps1
# 효과: git pull → dist 삭제 → npm run build → Nest/Nginx 재생성 → Redis 캐시 플러시

param(
    [string]$KeyPath = "",
    [string]$SshHost = "ubuntu@3.39.239.9",
    [switch]$FlushRedis,
    [switch]$Full
)

$Root = Split-Path -Parent $PSScriptRoot
if (-not $KeyPath) {
    $KeyPath = Join-Path $Root "daloa-key.pem"
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
    Write-Host "[deploy] SSH key not found: $KeyPath"
    exit 1
}

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
    $commands += "echo '[4/4] NestJS + Nginx 재생성...' && docker compose --profile production up -d --build --force-recreate nest nginx 2>&1 | tail -8"
}

if ($FlushRedis) {
    $commands += "echo '[추가] Redis 캐시 플러시...' && docker exec daloa-redis redis-cli -a `$REDIS_PASSWORD FLUSHALL 2>&1"
}

$commands += "echo '' && echo '배포 완료' && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -10"

$remoteCmd = $commands -join " && "

Write-Host "[deploy] SSH 접속 + 배포 시작..."
Write-Host ""

ssh -i "$KeyPath" -o StrictHostKeyChecking=no $SshHost $remoteCmd

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
