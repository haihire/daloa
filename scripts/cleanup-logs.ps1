# cleanup-logs.ps1 — 오래된 로그 파일 자동 정리
# 사용: powershell -File scripts/cleanup-logs.ps1 [-Days 30] [-Verbose]
# 효과: RETENTION_DAYS보다 오래된 로그 파일(app-*.log, error-*.log)을 삭제

param(
    [int]$Days = 30,
    [switch]$Verbose = $false
)

$Root = Split-Path -Parent $PSScriptRoot
$LogDirs = @(
    (Join-Path $Root "server\logs"),
    (Join-Path $Root "client\logs"),
    (Join-Path $Root "crawlers\logs")
)

$cutoffDate = (Get-Date).AddDays(-$Days)
$totalDeleted = 0
$totalSize = 0

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  로그 정리 (기준: $Days 일 이상 경과)"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($logDir in $LogDirs) {
    if (-not (Test-Path $logDir)) {
        if ($Verbose) {
            Write-Host "  [SKIP] $logDir (존재하지 않음)" -ForegroundColor Gray
        }
        continue
    }

    $dirName = Split-Path -Leaf $logDir
    Write-Host "[$dirName]" -ForegroundColor Yellow

    $logFiles = Get-ChildItem -Path $logDir -Filter "*.log" -File -ErrorAction SilentlyContinue
    if (-not $logFiles) {
        Write-Host "  (로그 파일 없음)" -ForegroundColor Gray
        Write-Host ""
        continue
    }

    $deleted = 0
    $deletedSize = 0

    foreach ($file in $logFiles) {
        if ($file.LastWriteTime -lt $cutoffDate) {
            $sizeKB = [math]::Round($file.Length / 1KB, 2)
            try {
                Remove-Item -Path $file.FullName -Force -ErrorAction Stop
                $deleted++
                $deletedSize += $file.Length
                if ($Verbose) {
                    Write-Host "  ✓ 삭제: $($file.Name) ($sizeKB KB)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  ✗ 실패: $($file.Name) — $_" -ForegroundColor Red
            }
        }
    }

    if ($deleted -gt 0) {
        $deletedSizeMB = [math]::Round($deletedSize / 1MB, 2)
        Write-Host "  결과: $deleted 개 파일 삭제 ($deletedSizeMB MB)" -ForegroundColor Green
        $totalDeleted += $deleted
        $totalSize += $deletedSize
    } else {
        Write-Host "  (정리할 파일 없음)" -ForegroundColor Gray
    }

    Write-Host ""
}

# 요약
if ($totalDeleted -gt 0) {
    $totalSizeMB = [math]::Round($totalSize / 1MB, 2)
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  총 $totalDeleted 개 파일 정리 완료" -ForegroundColor Green
    Write-Host "  확보 용량: $totalSizeMB MB" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  정리할 로그가 없습니다." -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Cyan
}

Write-Host ""
