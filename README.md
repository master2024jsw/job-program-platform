# 일자리사업 행정자동화 플랫폼

Electron + NestJS + SQLite 기반의 일자리사업 수행기관 행정자동화 플랫폼입니다.

## 구조

npm workspaces 기반 모노레포입니다.

```
job-program-platform/
├── apps/
│   ├── server/     # NestJS 백엔드 (REST API, TypeORM + better-sqlite3)
│   ├── desktop/    # Electron 메인 프로세스 (윈도우 생성, preload)
│   └── renderer/   # React + Vite 프론트엔드 UI
└── packages/
    └── shared/     # server / renderer가 공유하는 타입, 상수
```

- **server**: 로컬 `http://localhost:3000` 에서 REST API 제공, SQLite(`apps/server/data/job-program.sqlite`)에 데이터 저장
- **desktop**: 개발 모드에서는 `http://localhost:5173`(Vite dev server)를 로드하고, 배포 모드에서는 `renderer`의 빌드 결과물을 직접 로드
- **renderer**: desktop의 BrowserWindow 안에서 렌더링되는 UI, server의 REST API를 호출

## 요구 사항

- Node.js 20 이상
- Windows에서 `better-sqlite3` 네이티브 모듈 빌드를 위해 Visual Studio Build Tools(C++ 워크로드) 또는 `windows-build-tools`가 필요할 수 있습니다.

## 설치

```bash
npm install
```

## 개발 모드 실행

루트에서 아래 명령 하나로 server / renderer / desktop을 동시에 기동합니다 (`concurrently` + `wait-on` 사용).

```bash
npm run dev
```

개별 실행도 가능합니다.

```bash
npm run dev:server     # NestJS 서버만 (watch 모드)
npm run dev:renderer   # Vite dev server만
npm run dev:desktop    # server/renderer가 떠 있어야 정상 동작
```

## 빌드

```bash
npm run build           # shared → server → renderer → desktop 순서로 빌드
npm run package          # 빌드 후 electron-builder로 설치 파일 생성 (Windows: nsis)
```

## 환경 변수

`apps/server/.env.example`를 참고해 `apps/server/.env` 파일을 생성하세요.

```
PORT=3000
DB_PATH=./data/job-program.sqlite
NODE_ENV=development
```

## 알려진 후속 작업 (TODO)

- 프로덕션 패키징 시 Electron 앱 안에서 NestJS 서버를 함께 구동하도록 `electron-builder`의 `extraResources` / child_process 기동 로직 추가 필요
- 도메인 엔티티(참여자, 사업, 출결 등) 및 TypeORM 마이그레이션 설계
- 인증/권한, 로깅, 에러 핸들링 정책 수립
