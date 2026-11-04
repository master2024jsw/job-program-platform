# 데스크탑에서 잡도리AI 개발을 이어갈 수 있는지 점검한다.
#
# 쓰는 법: 이 파일을 마우스 오른쪽 클릭 → "PowerShell에서 실행"
#          (또는 PowerShell 창에서)  powershell -ExecutionPolicy Bypass -File 이파일경로
#
# 아무것도 설치하거나 바꾸지 않는다. 읽기만 한다.

$ErrorActionPreference = 'SilentlyContinue'

$script:ok = 0
$script:bad = 0
$script:warn = 0

function Head($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Pass($t) { Write-Host "  [됨]   $t" -ForegroundColor Green; $script:ok++ }
function Fail($t) { Write-Host "  [안됨] $t" -ForegroundColor Red;   $script:bad++ }
function Warn($t) { Write-Host "  [주의] $t" -ForegroundColor Yellow; $script:warn++ }
function Info($t) { Write-Host "         $t" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "잡도리AI — 데스크탑 개발환경 점검" -ForegroundColor White
Write-Host "컴퓨터: $env:COMPUTERNAME / 사용자: $env:USERNAME"
Write-Host "실행시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

# ── 1. 기본 도구 ────────────────────────────────────────────
Head "1. 기본 도구"

$nodeCmd = Get-Command node
if ($nodeCmd) {
  $nv = (& node -v)
  $major = 0
  if ($nv -match 'v(\d+)') { $major = [int]$Matches[1] }
  if ($major -ge 20) { Pass "Node.js $nv" }
  else { Fail "Node.js $nv — 20 이상이 필요합니다" }
} else {
  Fail "Node.js 없음 — https://nodejs.org 에서 LTS 설치"
}

if (Get-Command npm) { Pass "npm $(& npm -v)" } else { Fail "npm 없음" }
if (Get-Command git) { Pass "$(& git --version)" } else { Fail "Git 없음 — https://git-scm.com" }

# ── 2. C++ 빌드 도구 (better-sqlite3 컴파일용) ──────────────
Head "2. Visual Studio Build Tools (C++)"
Info "better-sqlite3 가 네이티브 모듈이라 없으면 npm install 이 실패합니다."

$pf86 = ${env:ProgramFiles(x86)}
$vswhere = Join-Path $pf86 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  $vc = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName
  if ($vc) { Pass "C++ 빌드 도구 설치됨 — $($vc -join ', ')" }
  else { Fail "Visual Studio 는 있으나 'C++를 사용한 데스크톱 개발' 워크로드가 없습니다" }
} else {
  Fail "Visual Studio Build Tools 없음 — 설치에 수십 분 걸립니다"
}

# ── 3. 저장소 ───────────────────────────────────────────────
Head "3. 프로젝트 저장소"

$candidates = @(
  (Join-Path $env:USERPROFILE 'projects\job-program-platform'),
  (Join-Path $env:USERPROFILE 'job-program-platform'),
  (Join-Path $env:USERPROFILE 'Documents\job-program-platform'),
  (Join-Path $env:USERPROFILE 'Desktop\job-program-platform'),
  (Join-Path $env:USERPROFILE 'OneDrive\바탕 화면\job-program-platform'),
  'D:\job-program-platform',
  'D:\projects\job-program-platform'
)
$repo = $null
foreach ($c in $candidates) {
  if (Test-Path (Join-Path $c '.git')) { $repo = $c; break }
}

if ($repo) {
  Pass "저장소 있음 — $repo"
  Push-Location $repo
  $branch = (& git branch --show-current)
  Info "현재 브랜치: $branch"
  if ($branch -eq 'claude/work-status-plan-cetclm') { Pass "작업 브랜치가 맞습니다" }
  else { Warn "작업 브랜치가 아닙니다. 필요한 브랜치: claude/work-status-plan-cetclm" }

  Info "마지막 커밋: $(& git log -1 --format='%h %ad %s' --date=short)"

  if (Test-Path (Join-Path $repo 'node_modules')) { Pass "node_modules 있음 (npm install 완료)" }
  else { Fail "node_modules 없음 — npm install 필요" }

  if (Test-Path (Join-Path $repo 'apps\server\.env')) { Pass "apps/server/.env 있음" }
  else { Fail "apps/server/.env 없음 — GEMINI_API_KEY 가 없어 AI 서류분석이 안 됩니다 (git 에 없는 파일, 수동 복사 필요)" }

  if (Test-Path (Join-Path $repo 'apps\server\data\job-program.sqlite')) { Pass "DB 파일 있음" }
  else { Warn "DB 없음 — 빈 상태로 시작합니다 (최초설정 마법사가 뜸)" }

  Pop-Location
} else {
  Fail "저장소를 못 찾았습니다"
  Info "찾아본 곳:"
  foreach ($c in $candidates) { Info "  $c" }
  Info "다른 곳에 있다면 그 경로를 Claude 에게 알려주세요."
}

# ── 4. Claude 데스크톱 앱 ───────────────────────────────────
Head "4. Claude 데스크톱 앱"
Info "폰에서 이어서 쓰려면 이 앱이 '실행 중'이어야 합니다. PC 만 켜두면 안 됩니다."

$appx = Get-AppxPackage -Name "*Claude*"
if ($appx) {
  Pass "설치됨 — 버전 $($appx.Version)"
  $proc = Get-Process -Name "claude"
  if ($proc) { Pass "지금 실행 중 ($($proc.Count)개 프로세스)" }
  else { Warn "설치는 됐으나 지금 실행 중이 아닙니다" }
} else {
  Fail "Claude 데스크톱 앱 없음 — Microsoft Store 에서 설치"
}

# ── 5. 전원·절전 설정 ───────────────────────────────────────
Head "5. 전원 / 절전"
Info "출장 3~4일간 꺼지면 안 되므로 절전이 꺼져 있어야 합니다."

# powercfg 출력은 언어마다 문구가 달라서, 16진수 값만 뽑아 위치로 읽는다.
# 출력 순서: 최소 / 최대 / 증분 / 현재 AC / 현재 DC → 뒤에서 두 번째가 AC.
$hexes = @()
$raw = & powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>$null
foreach ($line in $raw) {
  if ($line -match '0x([0-9a-fA-F]{8})') { $hexes += [Convert]::ToInt64($Matches[1], 16) }
}
if ($hexes.Count -ge 2) {
  $acSleep = $hexes[$hexes.Count - 2]
  if ($acSleep -eq 0) { Pass "전원 연결 시 절전 안 함" }
  else { Fail "전원 연결 시 $([math]::Round($acSleep / 60, 1))분 후 절전 — 꺼야 합니다" }
  Info "끄는 법: 설정 → 시스템 → 전원 → 화면 및 절전 → '다음 시간 후 PC 를 절전 모드로' = 안 함"
} else {
  Warn "절전 설정을 읽지 못했습니다 — 설정 → 시스템 → 전원 에서 직접 확인하세요"
}

$battery = Get-CimInstance Win32_Battery
if ($battery) { Warn "배터리가 감지됩니다 (노트북으로 보임) — 덮개를 닫으면 잠듭니다" }
else { Info "배터리 없음 — 데스크탑으로 보입니다 (덮개 잠듦 문제 없음)" }

# ── 6. 인터넷 ───────────────────────────────────────────────
Head "6. 인터넷"
$net = Test-NetConnection -ComputerName github.com -Port 443 -WarningAction SilentlyContinue
if ($net.TcpTestSucceeded) { Pass "github.com 연결 가능" }
else { Fail "github.com 에 연결하지 못했습니다" }

# ── 결과 ────────────────────────────────────────────────────
Write-Host ""
Write-Host "================ 결과 ================" -ForegroundColor White
Write-Host "  됨 $script:ok / 안됨 $script:bad / 주의 $script:warn"
Write-Host ""
if ($script:bad -eq 0) {
  Write-Host "  이 데스크탑에서 바로 이어서 개발할 수 있습니다." -ForegroundColor Green
} elseif ($script:bad -le 2) {
  Write-Host "  몇 가지만 채우면 됩니다. 위의 [안됨] 항목을 Claude 에게 알려주세요." -ForegroundColor Yellow
} else {
  Write-Host "  준비가 많이 필요합니다. 위 내용을 그대로 Claude 에게 보여주세요." -ForegroundColor Red
}
Write-Host "======================================"
Write-Host ""
Write-Host "이 화면을 캡처하거나 글자를 복사해서 Claude 에게 보내주세요."
Write-Host ""
Read-Host "확인했으면 Enter 를 누르세요"
