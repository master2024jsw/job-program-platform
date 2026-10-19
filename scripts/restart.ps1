# 잡도리AI 개발환경 재시작
# 사용법: npm run restart          (개발 Electron 앱 전체 재시작)
#         npm run restart:web              (서버 + 브라우저 — Electron 은 띄우지 않음)
#         npm run restart -- -ServerOnly   (서버만)
#
# 왜 필요한가: packages/shared 에 새 상수를 추가하면 Vite 가 옛 청크를 캐시해
# 런타임에 undefined 크래시가 난다. 재기동 + --force 가 필요하다. (CLAUDE.md 규칙 1)
param(
  [switch]$ServerOnly,
  [switch]$Web,
  [switch]$NoStart
)
$ErrorActionPreference = 'Continue'
function Step($m) { Write-Host "`n>>> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    $m" -ForegroundColor Yellow }

$root = Split-Path -Parent $PSScriptRoot

Step '기존 프로세스 정리'

# Electron / 배포본
foreach ($n in @('잡도리AI', 'electron')) {
  $p = Get-Process -Name $n -ErrorAction SilentlyContinue
  if ($p) { $p | Stop-Process -Force -ErrorAction SilentlyContinue; Ok "$n 종료 ($($p.Count)개)" }
}

# 포트 점유 프로세스 (3000=NestJS, 5173=Vite)
foreach ($port in @(3000, 5173)) {
  $pids = @()
  try {
    $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    $pids = netstat -ano | Select-String ":$port\s+.*LISTENING" |
            ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
  }
  foreach ($procId in $pids) {
    if ("$procId" -match '^\d+$' -and [int]$procId -gt 0) {
      $proc = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
      Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
      Ok "포트 $port 점유 해제 (PID $procId$(if($proc){" / $($proc.ProcessName)"}))"
    }
  }
  if (-not $pids) { Ok "포트 $port 사용 중 아님" }
}

Start-Sleep -Milliseconds 700

# 포트가 실제로 비었는지 확인
foreach ($port in @(3000, 5173)) {
  $still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($still) { Warn "포트 $port 가 여전히 점유 중입니다. 잠시 후 다시 시도하세요." }
}

Step 'Vite 사전번들 캐시 삭제'
$viteCache = Join-Path $root 'node_modules\.vite'
if (Test-Path $viteCache) {
  Remove-Item $viteCache -Recurse -Force -ErrorAction SilentlyContinue
  Ok '.vite 캐시 삭제 (shared 패키지 새 export 반영)'
} else { Ok '캐시 없음 (삭제 불필요)' }

if ($NoStart) { Write-Host "`n정리만 완료했습니다. (-NoStart)" -ForegroundColor Green; exit 0 }

Step '재기동'
Push-Location $root
if ($ServerOnly) {
  Ok 'npm run dev:server  (서버만, DB = apps/server/data)'
  & npm run dev:server
} elseif ($Web) {
  Ok 'npm run dev:web  (서버 + 브라우저 — Electron 은 띄우지 않음)'
  & npm run dev:web
} else {
  Ok 'npm run dev  (renderer --force + Electron, Electron이 서버를 함께 띄움)'
  & npm run dev
}
Pop-Location
