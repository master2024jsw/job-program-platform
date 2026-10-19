# CLAUDE.md

Claude Code가 이 저장소에서 세션을 시작할 때 참고하는 프로젝트 컨텍스트입니다.
컴퓨터를 바꾸거나 새 세션을 시작해도, 이 파일은 git에 커밋되어 있으므로 그대로 유지됩니다.

## 개발 진행 규칙 (사용자 요청 — 예외 없이 준수)

사용자는 비개발자다. 아래 두 규칙은 사용자가 직접 요청한 것이며 모든 작업에 적용한다.

### 규칙 1. 재시작·재빌드는 Claude가 알리고, Claude가 실행한다

- 코드를 수정한 뒤에는 **그 수정이 화면에 적용되려면 무엇이 필요한지 반드시 한 줄로 먼저 알린다.**
  - `✅ 저장만 하면 적용됨` — HMR로 바로 반영 (renderer .tsx 수정 등)
  - `🔄 서버 재시작 필요 — 제가 지금 하겠습니다` — server .ts 수정, .env 변경, 엔티티 변경
  - `⚡ Vite 강제 재기동 필요` — `packages/shared`에 **새 상수(const) export 추가** 시. 일반 재시작으로는 안 되고 `--force`가 필요하다 (옛 청크 캐시 → 런타임 `undefined` 크래시)
  - `📦 재배포 필요` — 배포본(잡도리AI.exe)에 반영하려면 `npm run update:local:full -- -Run`
- **사용자에게 명령어를 던지지 않는다.** 재시작·재빌드·재배포는 Claude가 직접 실행한다.
  명령어를 안내해야 하는 경우에도 먼저 실행하고, 다음부터 직접 하실 수 있게 참고로만 적는다.
- **노트북 재부팅은 요구하지 않는다.** 지금까지 재부팅이 필요했던 사례는 없다.
  네이티브 모듈 재빌드(`better-sqlite3`, `winax`) 등 불가피한 경우에만, 이유를 설명하고 승인을 받는다.
- **"수정했습니다"로 끝내지 않는다.** 재시작 후 서버가 실제로 떴는지 로그로 확인한 뒤 결과를 보고한다.
  로그·실행 확인 없이 '정상', '완료', '100%'라고 쓰지 않는다.
- 재시작 명령: `npm run restart` (서버·렌더러 강제 종료 후 `--force` 재기동)

### 규칙 2. 개발 단계 로그인은 가장 쉬운 값으로 고정한다

- 개발 환경(`NODE_ENV !== 'production'`)에서는 서버 기동 시 아래 계정을 자동으로 보장(없으면 생성, 비번 불일치면 재설정)한다.

  | 용도 | 아이디 | 비밀번호 | 권한 |
  |---|---|---|---|
  | 기관 관리자 | `admin123` | `adm123` | ADMIN (전 권한) |
  | 사업 담당자 | `user123` | `usr123` | STAFF (권한격리 테스트용) |

- 서버 기동 로그에 이 계정을 출력해 매번 찾지 않게 한다.
- **안전장치:** 배포 빌드(`npm run package` / `update:local`) 시 아래를 검사해 하나라도 걸리면 **빌드를 중단**하고 사유를 한국어로 표시한다.
  - 약한 비밀번호(`adm123`/`usr123`) 계정이 대상 DB에 남아 있음
  - `SESSION_SECRET`이 비어 있거나 `dev-only-insecure-secret`임
  - 이유: `workers` 테이블에 **실제 주민번호**가 있고, 설계서 §21은 실자료 존재를 전제하라고 한다.
    개발 중에는 아무 제약이 없고, 실제로 남에게 넘어가는 순간에만 막힌다. (설계서 F13·P0 겸 해결)
- 이 규칙은 **개발 편의용이다.** 운영 배포 시 계정·비밀번호 정책은 별도로 정한다.

## 기준 문서

기능을 새로 만들거나 우선순위를 판단할 때 아래 문서를 최우선으로 참고한다.

- [docs/01_업무프로세스_자동화매핑.md](docs/01_업무프로세스_자동화매핑.md) — 논문 기준 사업 업무흐름/실무 행정업무 매핑, 도메인 검증엔진 규칙 체계, 1차 개발범위
- [docs/04_현황_갭분석.md](docs/04_현황_갭분석.md) — 코드 vs 설계 vs 심사지적 갭분석, 11/14 본발표까지 권장 작업 순서

### 구조개선 설계서 v2 (2026-10-15 반영 — 이번 개발의 최상위 기준)

`docs/architecture-v2/` 아래 11개 파일. 기능을 새로 만들기 전에 반드시 해당 항목을 확인한다.

| 파일 | 내용 |
|---|---|
| [00_START_HERE.md](docs/architecture-v2/00_START_HERE.md) | 읽는 순서, 확인한 범위, 결정 5가지 |
| [01_Architecture_v2_Annotated.md](docs/architecture-v2/01_Architecture_v2_Annotated.md) | 전체 설계서 (ADR·업무흐름·권한·문서·검증·배포) |
| [02_Code_Audit_and_CiviCRM.md](docs/architecture-v2/02_Code_Audit_and_CiviCRM.md) | 현재 코드 진단 F01~F14, CiviCRM 역분석 |
| [03_Claude_Code_Playbook.md](docs/architecture-v2/03_Claude_Code_Playbook.md) | M0~M8 단계별 개발지시서·공통규칙 |
| [04_Acceptance_Tests.md](docs/architecture-v2/04_Acceptance_Tests.md) | 인수·회귀 테스트 51개 (전부 NOT_RUN) |
| [05_Data_Dictionary.md](docs/architecture-v2/05_Data_Dictionary.md) | 테이블·필드·관계·제약 데이터사전 |
| [06_Source_Index.md](docs/architecture-v2/06_Source_Index.md) | 근거 출처 (커밋 고정 링크) |
| `diagrams/`, `examples/` | ERD·처리흐름 Mermaid, 합성 정책·픽스처 예시 |

주의: 설계서 기준 커밋은 `d9dc635`(2026-09-29)이고 로컬은 그 뒤 57커밋이 더 진행됐다.
**설계서가 "없다"고 한 것이 이미 구현돼 있을 수 있으므로, 구현 전에 반드시 실제 코드를 먼저 확인한다.**
확인 결과 이미 해결된 항목: F01(businessId 추가됨), F11(Electron 패키징 완료), F06(validation 모듈 존재).
미해결로 확인된 항목: **F09**(synchronize:true·마이그레이션 없음), **F13**(CORS origin:true·개발용 secret 폴백), **F05**(지원금 급여/30 산정).

## 진행 중인 작업 (다른 컴퓨터에서 이어할 때 여기부터 확인)

- **브랜치**: `claude/work-status-plan-cetclm` (아직 `master`에 병합 전 — `git fetch origin && git checkout claude/work-status-plan-cetclm`으로 이어받을 것)
- [docs/05_실행계획_사업스코프확장.md](docs/05_실행계획_사업스코프확장.md) — 04문서 5절 순서1(사업 스코프 확장, 심사① 대응) — **A~E 전 단계 완료 (2026-09-22)**
- **검증엔진 4단계(기업신청) 완료 (2026-09-29)** — 04문서 순서2의 기업 적격 확인 파트. `modules/validation`(엔진·판정이력·컨트롤러), 규칙 원장 데이터(`resources/validation-rules/SENIOR-company.json`, `resources/job-classifications.json`), 주민번호 마스킹(`common/masking.util.ts`), 문서함 "기업 신청 검증" 대조·승인 탭(`CompanyValidationPanel`, businessId/companyId 파라미터로 5·6 재사용 가능), 참여기업 관리대장 내보내기. analyze()가 기업서류 분석 후 자동 검증.
- **다음 세션에서 바로 할 일**: 검증엔진 5단계(근로자신청 — calcRule 만연령·중복참여) / 6단계(지원금신청 — exceptionRule 법인전환·통장압류, SubsidyCalculation 회차·유형 컬럼). 착수 전 사용자 승인. 5·6에서 Worker `internEndDate`/`continuousHireDate`, SubsidyCalculation `subsidyType`/`round` 컬럼 추가 필요(데이터모델 문서 §5 참고).
- C1 작업 중 확인된 것: `Business.id`는 UUID가 아니라 `BIZ-2026-SENIOR` 형식 문자열이므로 businessId류 DTO 필드는 `@IsString()`을 쓸 것(`@IsUUID()` 아님). 또한 `POST /documents`·`POST /workers/import`처럼 Multer(FileInterceptor)를 쓰는 라우트는 전역 `BusinessAccessGuard`가 body의 businessId를 볼 수 없어(Guard가 인터셉터보다 먼저 실행됨) 컨트롤러에서 `BusinessesService.assertAccess()`를 직접 호출해야 함 — 새 멀티파트 엔드포인트를 추가할 때 같은 패턴을 따를 것.
- C2 작업 중 확인된 것: `npm run build -w apps/renderer`(프로덕션 `vite build`)가 `@job-program/shared`가 CommonJS로 컴파일되어 있어 Rollup이 `BUSINESS_TYPE_CODES` 등 named export를 정적으로 못 찾아 실패함(`SetupPage.tsx`에서 발생, B단계부터 있던 기존 버그 — `npm run dev`만 써왔어서 발견 안 됐던 것). `tsc -b`(타입체크)는 정상 통과하므로 `npm run dev` 개발 워크플로에는 영향 없음. 실제 프로덕션 패키징(Electron 빌드) 작업 시 shared 패키지를 ESM으로 바꾸거나 vite 설정에서 CJS interop을 조정해야 함 — README "알려진 후속 작업"에 반영 필요.
- 이 환경엔 `node_modules`가 없어서 `npm install`을 먼저 해야 `npm run dev`/`build`가 됨 (A단계 작업 중 확인됨, package-lock.json 변경은 없음)
- 4단계 작업 중 확인된 것: `packages/shared`에 **새 값(const) export를 추가한 뒤**에는 Vite dev 서버가 심링크 워크스페이스의 dist 변경을 사전번들 해시에 반영하지 않아 옛 청크를 캐시함(런타임에 `undefined` export로 크래시). `npm run dev -- --force`(또는 vite `--force`)로 재기동해야 새 export가 반영됨. 타입 전용 export는 무관.

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
- 2026-09-22: 05 실행계획(사업 스코프 확장, 심사① 대응) A~E 전 단계 완료 — businessId 스코프 백엔드·프론트엔드, 문서함 미분류 탭, 서류유형 코드 업로드·AI분석·검토화면 적용, 기업·근로자별 필수서류 체크리스트
- 2026-09-29: 검증엔진 4단계(기업신청) — 규칙 원장 R-101~104(3자 대조·4대보험·동의·직종판정) 데이터 로드, DomainValidationEngine·JudgmentHistory, 주민번호 마스킹, 문서함 대조·승인 UI, 참여기업 관리대장 내보내기. 비젼투어 케이스 재현. 다음은 검증엔진 5·6단계(착수 전 사용자 승인) — 상세는 위 "진행 중인 작업" 참고
- 아직 프로덕션 패키징(Electron 안에서 NestJS 서버 동봉 구동)은 미완료 — README의 "알려진 후속 작업" 참고
