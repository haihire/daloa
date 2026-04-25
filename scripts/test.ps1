# test.ps1 - 하네스 엔지니어링 테스트 스크립트
# 사용: powershell -File scripts/test.ps1
# 효과: 서버 단위 테스트 -> 클라이언트 테스트 -> 결과 요약

param(
    [switch]$Coverage,    # -Coverage 플래그 시 커버리지 포함
    [switch]$E2E          # -E2E 플래그 시 E2E 테스트 포함
)

$Root     = Split-Path -Parent $PSScriptRoot
$exitCode = 0

Write-Host ""
Write-Host "========================================"
Write-Host "  하네스 테스트 실행"
Write-Host "========================================"
Write-Host ""

# 함수: 테스트 실행 후 결과 반환 (0=pass, 1=fail)
function Run-Tests {
    param(
        [string]$Label,
        [string]$Dir,
        [string]$Script
    )
    Write-Host "---"
    Write-Host "  $Label"
    Write-Host "---"
    Push-Location $Dir
    & npm run $Script | Out-Host
    $result = $LASTEXITCODE
    Pop-Location
    if ($result -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] $Label 실패"
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "[PASS] $Label 통과"
        Write-Host ""
    }
    return $result
}

# 1) 서버 단위 테스트
$serverScript = if ($Coverage) { "test:cov" } else { "test" }
$r = Run-Tests "서버 단위 테스트 (Jest)" "$Root\server" $serverScript
if ($r -ne 0) { $exitCode = 1 }

# 2) 클라이언트 컴포넌트 테스트
$clientScript = if ($Coverage) { "test:coverage" } else { "test" }
$r = Run-Tests "클라이언트 컴포넌트 테스트 (Vitest)" "$Root\client" $clientScript
if ($r -ne 0) { $exitCode = 1 }

# 3) E2E (옵션)
if ($E2E) {
    $r = Run-Tests "서버 E2E 테스트 (Supertest)" "$Root\server" "test:e2e"
    if ($r -ne 0) { $exitCode = 1 }
}

# 최종 결과
Write-Host "========================================"
if ($exitCode -eq 0) {
    Write-Host "  결과: 전체 테스트 통과"
} else {
    Write-Host "  결과: 실패한 테스트 있음"
}
Write-Host "========================================"
Write-Host ""

exit $exitCode
