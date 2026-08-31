# CLAUDE.md

Claude Code가 이 저장소에서 세션을 시작할 때 참고하는 프로젝트 컨텍스트입니다.
컴퓨터를 바꾸거나 새 세션을 시작해도, 이 파일은 git에 커밋되어 있으므로 그대로 유지됩니다.

## 프로젝트

일자리사업(고용노동청 위탁사업 등) 수행기관을 위한 행정자동화 플랫폼.
Electron 데스크톱 앱 + NestJS 백엔드 + React 프론트엔드, 로컬 SQLite 기반.

- 상세 구조/실행법: [README.md](README.md)
- 다른 컴퓨터로 이전할 때: [SETUP.md](SETUP.md)

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

## git에 포함되지 않는 것 (컴퓨터마다 별도 필요)

- `apps/server/.env`
- `apps/server/data/*.sqlite` (실 데이터)
- `apps/server/data/uploads/*` (업로드 서류)

새 컴퓨터에서는 [SETUP.md](SETUP.md)의 백업 복원 절차를 따를 것.

## 진행 상황 / 개발 이력

- 2026-07-16: 모노레포 스캐폴딩, 기업/근로자 CRUD, 메일 자동발송
- 2026-07-30: 문서함 AI분석(Gemini), 신사업 알리미(크롤링), 지원금 산정, 엑셀 업/다운로드
- 2026-07-31 (1차 개발지시서): 로그인/세션, 신사업 알리미 확장(D-day 등), 기업 DB 표준양식 재구성
- 아직 프로덕션 패키징(Electron 안에서 NestJS 서버 동봉 구동)은 미완료 — README의 "알려진 후속 작업" 참고
