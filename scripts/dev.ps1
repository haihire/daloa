# dev.ps1 — 하네스 엔지니어링 시작 스크립트
# 사용: powershell -File scripts/dev.ps1
# 효과: 포트 점유 프로세스 정리 → 서버(3001) + 클라이언트(3000) 시작 → logs/ 에 기록

param(
    [int]$ServerPort = 3001,
    [int]$ClientPort = 3000
)

$Root = Split-Path -Parent $PSScriptRoot

# ─────────────────────────────────────────
# 함수: 포트를 점유 중인 프로세스 강제 종료
# ─────────────────────────────────────────
function Kill-Port {
    param([int]$Port)
    $pids = netstat -ano | Select-String ":$Port\s" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique | Where-Object { $_ -match '^\d+$' }

    foreach ($pid in $pids) {
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "[dev] 포트 $Port 점유 프로세스 (PID $pid) 종료"
        } catch {
            # 이미 종료됨
        }
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  하네스 개발 환경 시작"
Write-Host "  서버: http://localhost:$ServerPort"
Write-Host "  클라이언트: http://localhost:$ClientPort"
Write-Host "========================================"
Write-Host ""

# 1) 오래된 로그 정리 (30일 이상)
Write-Host "[1/4] 오래된 로그 정리 중..."
& "$Root\scripts\cleanup-logs.ps1" -Days 30 | Out-Null
Write-Host "[1/4] 완료`n"

# 2) 기존 포트 정리
Write-Host "[2/4] 기존 포트 정리 중..."
Kill-Port $ServerPort
Kill-Port $ClientPort
Start-Sleep -Milliseconds 500

# 3) 로그 디렉터리 보장
$today = (Get-Date).ToString("yyyy-MM-dd")
$serverLogDir  = Join-Path $Root "server\logs"
$clientLogDir  = Join-Path $Root "client\logs"
$serverLogFile = Join-Path $serverLogDir "app-$today.log"
$clientLogFile = Join-Path $clientLogDir "app-$today.log"

if (-not (Test-Path $serverLogDir)) { New-Item -ItemType Directory -Path $serverLogDir | Out-Null }
if (-not (Test-Path $clientLogDir)) { New-Item -ItemType Directory -Path $clientLogDir | Out-Null }

# 4) 서버 시작 (별도 창 — 로그를 파일로도 저장)
Write-Host "[3/4] 서버 시작 (포트 $ServerPort)..."
$serverCmd = "cd '$Root\server'; npm run start:dev *>&1 | Tee-Object -FilePath '$serverLogFile' -Append"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $serverCmd -WindowStyle Normal

Start-Sleep -Seconds 3

# 5) 클라이언트 시작 (별도 창 — 로그를 파일로도 저장)
Write-Host "[4/4] 클라이언트 시작 (포트 $ClientPort)..."
$clientCmd = "cd '$Root\client'; npm run dev *>&1 | Tee-Object -FilePath '$clientLogFile' -Append"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $clientCmd -WindowStyle Normal

Write-Host ""
Write-Host "[dev] 시작 완료."
Write-Host "  로그 정리: 30일 이상 경과한 로그 자동 삭제됨"
Write-Host "  서버 로그 : $serverLogFile"
Write-Host "  클라이언트 로그 : $clientLogFile"
Write-Host ""
Write-Host "  테스트 실행 (별도 터미널):"
Write-Host "    cd server  ;  npm test"
Write-Host "    cd client  ;  npm test"
Write-Host ""
Write-Host "  로그 수동 정리 (필요 시):"
Write-Host "    powershell -File scripts/cleanup-logs.ps1 -Days 7 -Verbose"
Write-Host ""
