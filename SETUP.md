# 새 컴퓨터 이전 가이드

이 문서는 `job-program-platform`을 다른 컴퓨터에서 이어서 개발하기 위한 설치·복원·실행 순서입니다.
기본적인 구조/명령어는 [README.md](README.md)를 따르고, 이 문서는 **"이전" 시나리오**에 필요한 절차만 정리합니다.

## 0. 사전 체크리스트

옮기기 전에 아래가 준비됐는지 확인하세요.

- [ ] 코드가 GitHub(`origin`)에 푸시되어 있음 — `git push` 완료
- [ ] `apps/server/.env`, `apps/server/data/job-program.sqlite`, `apps/server/data/uploads/`를 압축해 백업함
- [ ] 백업 zip을 구글 드라이브(또는 USB)에 업로드/복사함 — **비공개(제한됨)** 공유 설정 확인
- [ ] 새 컴퓨터에 관리자 권한 계정으로 로그인 가능

## 1. 새 컴퓨터 설치 순서

아래 순서대로 설치하세요. 순서가 바뀌어도 크게 문제는 없지만, Build Tools는 `npm install`(4번) **전에** 설치되어 있어야 합니다.

### 1) Node.js 설치
- [nodejs.org](https://nodejs.org)에서 **20 이상 LTS** 버전 설치 (참고: 원래 컴퓨터는 v24.18.0 사용 중)
- 설치 확인:
  ```bash
  node -v
  npm -v
  ```

### 2) Git 설치
- [git-scm.com](https://git-scm.com)에서 설치 (Windows는 Git Bash가 함께 설치됨)

### 3) Visual Studio Build Tools 설치 (Windows 필수)
`better-sqlite3`가 네이티브(C++) 모듈이라 컴파일이 필요합니다.
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio) 다운로드
- 설치 화면에서 **"C++를 사용한 데스크톱 개발"** 워크로드 체크 후 설치
- 이 단계를 건너뛰면 4번 `npm install`에서 `node-gyp` 관련 오류로 실패합니다.

### 4) Claude Code 설치 (선택)
이어서 Claude Code로 개발하려면:
- **웹에서 쓰는 경우**: [claude.ai/code](https://claude.ai/code) 접속 후 기존 계정(`master2024.jsw@gmail.com`)으로 로그인
- **CLI로 쓰는 경우**:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude login
  ```

## 2. 코드 및 데이터 복원

### 1) 저장소 클론
```bash
git clone https://github.com/master2024jsw/job-program-platform.git
cd job-program-platform
```

### 2) 백업 zip 압축 해제
구글 드라이브에서 `job-program-platform-backup_2026-08-14.zip`을 다운로드한 뒤, 압축을 풀어 아래 위치에 **그대로** 덮어씁니다.

| 백업 파일 | 복원 위치 |
|---|---|
| `.env` | `job-program-platform/apps/server/.env` |
| `job-program.sqlite` | `job-program-platform/apps/server/data/job-program.sqlite` |
| `uploads/` | `job-program-platform/apps/server/data/uploads/` |

> `apps/server/data/` 폴더가 없다면 먼저 만들어주세요.

### 3) 의존성 설치
```bash
npm install
```
루트에서 한 번만 실행하면 `apps/server`, `apps/desktop`, `apps/renderer`, `packages/shared` 전체가 설치됩니다 (npm workspaces). `better-sqlite3`는 이 컴퓨터 환경에 맞게 새로 빌드됩니다.

## 3. 실행

루트에서 아래 명령 하나로 서버·프론트엔드·Electron 앱이 동시에 뜹니다.
```bash
npm run dev
```

개별 실행도 가능합니다.
```bash
npm run dev:server     # NestJS API (http://localhost:3000)
npm run dev:renderer   # Vite dev server (http://localhost:5173)
npm run dev:desktop    # server/renderer가 떠 있어야 정상 동작
```

## 4. 정상 동작 확인 체크리스트

- [ ] `http://localhost:3000/health` 접속 시 정상 응답
- [ ] `http://localhost:5173` 접속 시 **로그인 화면**이 뜸 (복원한 DB에 계정이 이미 있으므로 최초설정 마법사가 아니라 로그인 화면이 나와야 정상)
- [ ] 기존 로그인 ID/비밀번호로 로그인되고, 기업/근로자 데이터가 그대로 보임
- [ ] Electron 앱 창이 정상적으로 뜸

## 5. 자주 발생하는 문제

**`npm install` 중 `node-gyp` / `better-sqlite3` 빌드 오류**
→ 1-3) Visual Studio Build Tools(C++ 워크로드)가 설치됐는지 확인 후 `npm install` 재실행.

**`Error: listen EADDRINUSE: address already in use :::3000`**
→ 이미 3000번 포트를 쓰는 프로세스가 떠 있는 것입니다. 아래로 확인 후 종료하세요.
```bash
netstat -ano | findstr :3000
taskkill /PID <위에서 나온 PID> /F
```

**로그인 화면 대신 최초설정 마법사(기관 등록)가 뜸**
→ `apps/server/data/job-program.sqlite` 복원이 안 된 것입니다. 2-2) 단계를 다시 확인하세요.

**메일 발송/문서 AI분석이 안 됨**
→ `.env`의 `SMTP_*`, `GEMINI_API_KEY`, `IMAP_*` 값이 비어있지 않은지 확인하세요. (값이 없어도 서버 자체는 정상 기동되고, 해당 기능만 실패 로그를 남깁니다.)

## 6. 보안 체크리스트

- [ ] 새 컴퓨터로 복원 완료 후, 구글 드라이브에 올린 백업 zip은 다운로드가 끝나면 **삭제 또는 비공개 유지**
- [ ] `apps/server/.env`는 절대 `git add`/커밋하지 않기 (이미 `.gitignore`에 등록되어 있음)
- [ ] GitHub 저장소가 **Private**인지 다시 한번 확인
