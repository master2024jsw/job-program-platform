<#
  잡도리AI — 로컬 포터블 앱 업데이트 스크립트

  하는 일:
    1) 실행 중인 앱 종료 (파일 잠금 방지)
    2) shared / server / renderer 빌드
    3) 바뀐 결과물을 포터블 폴더(%LOCALAPPDATA%\Programs\잡도리AI)에 복사
    4) (옵션) 앱 재실행

  사용법 (프로젝트 루트에서):
    powershell -ExecutionPolicy Bypass -File scripts\update-local.ps1
    powershell -ExecutionPolicy Bypass -File scripts\update-local.ps1 -Run        # 끝나고 앱 자동 실행
    powershell -ExecutionPolicy Bypass -File scripts\update-local.ps1 -Full        # 전체 재패키징(Electron 껍데기/의존성 변경 시)
    powershell -ExecutionPolicy Bypass -File scripts\update-local.ps1 -Full -Run

  참고:
    - 화면(renderer)·서버(server) 로직 수정은 기본 모드로 충분합니다(빠름).
    - apps/desktop(Electron main/preload) 수정이나 의존성 추가 시에만 -Full 을 쓰세요.
    - 데이터(%APPDATA%\@job-program\desktop)는 건드리지 않습니다.
#>
param(
  [switch]$Full,   # 전체 재패키징(electron-builder) 후 포터블 폴더 통째로 갱신
  [switch]$Run     # 완료 후 앱 실행
)

$ErrorActionPreference = 'Stop'

# --- 경로 ---
$RepoRoot   = Split-Path -Parent $PSScriptRoot
$Portable   = Join-Path $env:LOCALAPPDATA 'Programs\잡도리AI'
$ExeName    = '잡도리AI.exe'
$Exe        = Join-Path $Portable $ExeName
$Unpacked   = Join-Path $RepoRoot 'apps\desktop\release\win-unpacked'

function Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }

Push-Location $RepoRoot
try {
  # --- 1) 실행 중인 앱 종료 + 포트 3000 정리 ---
  Step '실행 중인 앱 종료'
  Get-Process -Name '잡도리AI' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $pids = (netstat -ano | Select-String ':3000 ' | Select-String 'LISTENING') -replace '.*\s(\d+)$', '$1'
  foreach ($procId in $pids) { if ($procId -match '^\d+$') { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } }
  Start-Sleep -Seconds 2
  Ok '종료 완료'

  if ($Full) {
    # --- 전체 재패키징 경로 ---
    Step '전체 빌드 + 재패키징 (electron-builder) — 몇 분 걸립니다'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }
    Push-Location (Join-Path $RepoRoot 'apps\desktop')
    try {
      & npx --no electron-builder
      if ($LASTEXITCODE -ne 0) { throw 'electron-builder 실패' }
    } finally { Pop-Location }

    Step "포터블 폴더 통째로 갱신: $Portable"
    if (-not (Test-Path $Unpacked)) { throw "win-unpacked 가 없습니다: $Unpacked" }
    if (Test-Path $Portable) { Remove-Item $Portable -Recurse -Force }
    New-Item -ItemType Directory -Path $Portable -Force | Out-Null
    Copy-Item (Join-Path $Unpacked '*') $Portable -Recurse -Force
    Ok '전체 갱신 완료'
  }
  else {
    # --- 빠른 경로: dist만 빌드 후 복사 ---
    Step 'shared 빌드'
    & npm run build -w packages/shared
    if ($LASTEXITCODE -ne 0) { throw 'shared 빌드 실패' }

    Step 'server 빌드'
    & npm run build -w apps/server
    if ($LASTEXITCODE -ne 0) { throw 'server 빌드 실패' }

    Step 'renderer 빌드'
    & npm run build -w apps/renderer
    if ($LASTEXITCODE -ne 0) { throw 'renderer 빌드 실패' }

    if (-not (Test-Path $Exe)) {
      throw "포터블 앱이 없습니다: $Exe`n    먼저 -Full 모드로 한 번 전체 빌드하세요."
    }

    Step "포터블 폴더에 복사: $Portable"
    # server dist
    $dstServer = Join-Path $Portable 'resources\server\dist'
    Remove-Item $dstServer -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $RepoRoot 'apps\server\dist') $dstServer -Recurse -Force
    Ok 'server/dist 복사'

    # renderer dist
    $dstRenderer = Join-Path $Portable 'resources\renderer\dist'
    Remove-Item $dstRenderer -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $RepoRoot 'apps\renderer\dist') $dstRenderer -Recurse -Force
    Ok 'renderer/dist 복사'

    # shared dist (server 런타임이 참조) — 있을 때만
    $dstShared = Join-Path $Portable 'resources\server\node_modules\@job-program\shared\dist'
    if (Test-Path (Split-Path $dstShared -Parent)) {
      Remove-Item $dstShared -Recurse -Force -ErrorAction SilentlyContinue
      Copy-Item (Join-Path $RepoRoot 'packages\shared\dist') $dstShared -Recurse -Force
      Ok 'shared/dist 복사'
    }
  }

  Write-Host "`n✅ 업데이트 완료: $Portable" -ForegroundColor Green

  if ($Run) {
    Step '앱 실행'
    Start-Process $Exe
    Ok '실행함 (첫 실행 시 서버 기동까지 몇 초 걸릴 수 있음)'
  } else {
    Write-Host "   바탕화면 '잡도리AI' 바로가기로 실행하세요." -ForegroundColor Gray
  }
}
finally {
  Pop-Location
}
