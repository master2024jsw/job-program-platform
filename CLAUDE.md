# CLAUDE.md

Claude Code가 이 저장소에서 세션을 시작할 때 참고하는 프로젝트 컨텍스트입니다.
컴퓨터를 바꾸거나 새 세션을 시작해도, 이 파일은 git에 커밋되어 있으므로 그대로 유지됩니다.

## 기준 문서

기능을 새로 만들거나 우선순위를 판단할 때 아래 문서를 최우선으로 참고한다.

- [docs/01_업무프로세스_자동화매핑.md](docs/01_업무프로세스_자동화매핑.md) — 논문 기준 사업 업무흐름/실무 행정업무 매핑, 도메인 검증엔진 규칙 체계, 1차 개발범위
- [docs/04_현황_갭분석.md](docs/04_현황_갭분석.md) — 코드 vs 설계 vs 심사지적 갭분석, 11/14 본발표까지 권장 작업 순서

## 진행 중인 작업 (다른 컴퓨터에서 이어할 때 여기부터 확인)

- **브랜치**: `claude/work-status-plan-cetclm` (아직 `master`에 병합 전 — `git fetch origin && git checkout claude/work-status-plan-cetclm`으로 이어받을 것)
- [docs/05_실행계획_사업스코프확장.md](docs/05_실행계획_사업스코프확장.md) — 04문서 5절 순서1(사업 스코프 확장, 심사① 대응) — **A~E 전 단계 완료 (2026-09-22)**
- **다음 세션에서 바로 할 일**: 04문서 5절 순서2(검증엔진 MVP — 규칙 데이터 스키마, 실행기, 판정 이력, REQ2·REQ3). **단, 착수 전에 반드시 사용자에게 먼저 알리고 승인받을 것** — 2026-09-22 사용자 명시 요청. `common/domain-validation-engine.interface.ts` 등에 실제 구현을 시작하기 전 채팅으로 확인부터.
- C1 작업 중 확인된 것: `Business.id`는 UUID가 아니라 `BIZ-2026-SENIOR` 형식 문자열이므로 businessId류 DTO 필드는 `@IsString()`을 쓸 것(`@IsUUID()` 아님). 또한 `POST /documents`·`POST /workers/import`처럼 Multer(FileInterceptor)를 쓰는 라우트는 전역 `BusinessAccessGuard`가 body의 businessId를 볼 수 없어(Guard가 인터셉터보다 먼저 실행됨) 컨트롤러에서 `BusinessesService.assertAccess()`를 직접 호출해야 함 — 새 멀티파트 엔드포인트를 추가할 때 같은 패턴을 따를 것.
- C2 작업 중 확인된 것: `npm run build -w apps/renderer`(프로덕션 `vite build`)가 `@job-program/shared`가 CommonJS로 컴파일되어 있어 Rollup이 `BUSINESS_TYPE_CODES` 등 named export를 정적으로 못 찾아 실패함(`SetupPage.tsx`에서 발생, B단계부터 있던 기존 버그 — `npm run dev`만 써왔어서 발견 안 됐던 것). `tsc -b`(타입체크)는 정상 통과하므로 `npm run dev` 개발 워크플로에는 영향 없음. 실제 프로덕션 패키징(Electron 빌드) 작업 시 shared 패키지를 ESM으로 바꾸거나 vite 설정에서 CJS interop을 조정해야 함 — README "알려진 후속 작업"에 반영 필요.
- 이 환경엔 `node_modules`가 없어서 `npm install`을 먼저 해야 `npm run dev`/`build`가 됨 (A단계 작업 중 확인됨, package-lock.json 변경은 없음)

## 프로젝트

일자리사업(고용노동청 위탁사업 등) 수행기관을 위한 행정자동화 플랫폼.
Electron 데스크톱 앱 + NestJS 백엔드 + React 프론트엔드, 로컬 SQLite 기반.

- 상세 구조/실행법: [README.md](README.md)
- 다른 컴퓨터로 이전할 때: [SETUP.md](SETUP.md)
- 저장소(Private): https://github.com/master2024jsw/job-program-platform (원격 이름 `origin`, 기본 브랜치 `master`)

## 스택 요약

- 모노레포: npm workspaces (`apps/server`, `apps/desktop`, `apps/renderer`, `packages/shared`)
- 백엔드: NestJS + TypeORM + `better-sqlite3` (네이티브 모듈 — Windows는 VS Build Tools 필요)
- 프론트엔드: React + Vite, Electron `BrowserWindow`에서 렌더링
- 인증: `express-session` 기반 세션 로그인 (JWT 아님)

## 도메인 모델 (핵심)

- `Institution` / `User` / `Business` / `UserBusiness` — 기관·계정·사업·권한
- `Company` / `CompanyBusiness` — 기업(표준양식 기준) × 사업별 진행상태
- `Worker` — 기업 소속 근로자
- `JobAnnouncement` — 신사업 알리미 (직접등록 + 대구고용노동청 위탁공고 크롤링)
- `Document` — 문서함, Gemini AI 서류분석
- `MailTemplate` / `MailLog` — 메일 템플릿·발송 로그
- `SubsidyCalculation` / `SubsidySetting` — 지원금 산정

## 외부 연동 (환경변수 필요, `apps/server/.env`)

| 기능 | 관련 env |
|---|---|
| 메일 발송 | `SMTP_*`, `MAIL_FROM` |
| AI 문서분석 | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| 메일 자동수집 | `IMAP_*` |
| 세션 | `SESSION_SECRET`, `SESSION_IDLE_TIMEOUT_MINUTES` |

값이 비어 있어도 서버는 정상 기동되며, 해당 기능만 실패 로그를 남기고 500으로 죽지 않도록 설계되어 있음.

## 코딩 컨벤션 (기존 코드에서 관찰된 패턴 — 새 코드도 맞춰서 작성)

- 커밋 메시지: 한국어. 요약 줄 + 필요시 본문에 "무엇을/왜"를 설명하는 불릿.
- 모듈 구조: `apps/server/src/modules/<도메인>/` 아래에 `*.entity.ts`, `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/create-*.dto.ts` / `dto/update-*.dto.ts`를 함께 배치.
- 입력 검증: `class-validator` 데코레이터 + 전역 `ValidationPipe({ whitelist: true, transform: true })` (main.ts) 사용.
- 외부 연동(SMTP/IMAP/크롤링/AI)은 실패해도 API가 500으로 죽지 않고 실패 로그를 남기는 방어적 패턴을 따름 — `mail.service.ts`가 참고 예시.
- 파일명: kebab-case (`create-company.dto.ts`), 클래스/엔티티명: PascalCase.
- 프론트엔드: 페이지 단위 컴포넌트는 `apps/renderer/src/pages/`, API 호출 래퍼는 `apps/renderer/src/api/`에 도메인별로 분리.

## 알려진 이슈 / TODO

- **`npm run lint`가 아직 동작하지 않음**: `apps/server`, `apps/renderer` package.json에 `lint` 스크립트는 있지만, 저장소 어디에도 ESLint 설정 파일(`.eslintrc*`, `eslint.config.*`)이 없음. 실행하면 설정 없음 오류가 남 — 설정 추가 필요.
- `dev:server` 실행 후 콘솔이 `Found 0 errors. Watching for file changes.`에서 멈춘 것처럼 보이면, 대부분 3000번 포트를 다른 프로세스가 이미 점유(`EADDRINUSE`)하고 있는 것. 새로 로그가 안 찍히는 게 아니라 애초에 리스닝을 못 한 상태이니 `netstat -ano | findstr :3000` → `taskkill /PID <PID> /F`로 확인.
- 로컬 개발 DB에는 테스트용 관리자 계정(로그인ID `admin`)이 이미 들어있음 — 실제 배포 전 반드시 교체/삭제할 것.
- 프로덕션 패키징 시 Electron 안에서 NestJS 서버를 함께 구동하는 로직 미완성 (README "알려진 후속 작업" 참고).
- **`npm run build -w apps/renderer`(프로덕션 `vite build`)가 실패함**: `@job-program/shared`가 CommonJS로 컴파일되어 있어 Rollup이 named export(`BUSINESS_TYPE_CODES` 등)를 정적으로 못 찾음. `npm run dev`(Vite dev 서버, esbuild)는 영향 없이 정상 동작하고 `tsc -b` 타입체크도 통과함 — 지금까지 프로덕션 빌드를 실제로 돌려본 적이 없어서 발견 안 됐던 기존 버그(2026-09-22 C2 작업 중 발견). 프로덕션 패키징 작업 시 shared 패키지를 ESM으로 바꾸거나 vite의 CJS interop 설정을 조정해야 함.

## git에 포함되지 않는 것 (컴퓨터마다 별도 필요)

- `apps/server/.env`
- `apps/server/data/*.sqlite` (실 데이터)
- `apps/server/data/uploads/*` (업로드 서류)

새 컴퓨터에서는 [SETUP.md](SETUP.md)의 백업 복원 절차를 따를 것.

## 진행 상황 / 개발 이력

- 2026-07-16: 모노레포 스캐폴딩, 기업/근로자 CRUD, 메일 자동발송
- 2026-07-30: 문서함 AI분석(Gemini), 신사업 알리미(크롤링), 지원금 산정, 엑셀 업/다운로드
- 2026-07-31 (1차 개발지시서): 로그인/세션, 신사업 알리미 확장(D-day 등), 기업 DB 표준양식 재구성
- 2026-09-21: 논문 심사 지적 대응 기준 문서(01, 04) 반영, 05 실행계획 수립 후 A·B단계 완료 (사업유형 3종·서류유형 코드·필수서류 API, 로그인 화면 사업 선택)
- 2026-09-22: 05 실행계획(사업 스코프 확장, 심사① 대응) A~E 전 단계 완료 — businessId 스코프 백엔드·프론트엔드, 문서함 미분류 탭, 서류유형 코드 업로드·AI분석·검토화면 적용, 기업·근로자별 필수서류 체크리스트. 다음은 04문서 순서2(검증엔진), 착수 전 사용자 승인 필요 — 상세는 위 "진행 중인 작업" 참고
- 아직 프로덕션 패키징(Electron 안에서 NestJS 서버 동봉 구동)은 미완료 — README의 "알려진 후속 작업" 참고
