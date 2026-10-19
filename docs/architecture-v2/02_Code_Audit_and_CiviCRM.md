# 잡도리 AI — 현재 코드 진단과 CiviCRM 구조 역분석

작성일: 2026-10-15 · 검토 방식: 공개 소스와 내부 설계문서의 정적 대조

> **읽는 방법:** ‘확인’은 소스에서 직접 읽은 사실, ‘해석’은 그 사실로부터 도출한 위험, ‘제안’은 앞으로 구현할 내용입니다. 아래 재현 절차는 테스트 지시이지, 이미 실행해 성공·실패를 확인한 결과가 아닙니다.

## 1. 기준과 한계

| 구분 | 확인한 기준 | 쉬운 설명 |
| --- | --- | --- |
| 잡도리 저장소 | `master2024jsw/job-program-platform`, `master`, `d9dc635a04ff5c76a8ef544547935a79b6ec770c` | 이번에 읽은 코드의 고정된 시점입니다. 로컬 Claude Code의 미커밋 변경은 포함하지 않습니다. |
| 마지막 커밋 | 2026-09-29, `Update .env.example` | 검토일과 코드가 마지막으로 변경된 날은 다릅니다. [J00](https://github.com/master2024jsw/job-program-platform/commit/d9dc635a04ff5c76a8ef544547935a79b6ec770c) |
| 내부 요구사항 | `docs/01_업무프로세스_자동화매핑.md`, `docs/04_현황_갭분석.md`, 루트 `05_실행계획_사업스코프확장.md` | 무엇을 만들려는지 설명하는 문서입니다. 완료 체크 표시만으로 구현 완료를 인정하지 않습니다. [J01](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/01_%EC%97%85%EB%AC%B4%ED%94%84%EB%A1%9C%EC%84%B8%EC%8A%A4_%EC%9E%90%EB%8F%99%ED%99%94%EB%A7%A4%ED%95%91.md) / [J02](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/04_%ED%98%84%ED%99%A9_%EA%B0%AD%EB%B6%84%EC%84%9D.md) / [J03](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/05_%EC%8B%A4%ED%96%89%EA%B3%84%ED%9A%8D_%EC%82%AC%EC%97%85%EC%8A%A4%EC%BD%94%ED%94%84%ED%99%95%EC%9E%A5.md) |
| 논문 | 대화에 첨부된 ver.11 PDF의 요구사항·설계 부분 | 저장소 문서가 인용한 ver.12 논문 원문 전체를 확인한 것은 아닙니다. |
| 참고 프로그램 | `civicrm/civicrm-core`, `f49ccf2635d072c7afbecb635147d1b0838883e4` | CiviCRM 전체 설치가 아니라 Case·Activity·Grant 관련 스키마와 일부 처리 코드를 읽었습니다. [C00](https://github.com/civicrm/civicrm-core/commit/f49ccf2635d072c7afbecb635147d1b0838883e4) |
| 실행 확인 | 수행하지 않음 | 이 환경에서 저장소 clone은 DNS 해석 실패로 완료되지 않았습니다. 연결된 GitHub 도구로 파일을 읽었으며, 빌드·Windows 설치·HWP 변환·실데이터 DB·사용자가 겪는 오류 로그는 검증하지 않았습니다. |

**결론의 범위:** 확인된 구조적 공백과 결함 후보는 제시할 수 있지만, 실제 반복 오류의 단일 원인이 무엇인지는 아직 확정할 수 없습니다. 이전 대화에서 표현한 기능별 개발률은 측정값이 아니므로 이번 설계의 판단 근거로 사용하지 않습니다.

## 2. 유지할 부분

| 현재 설계 | 유지 이유 | 관련 소스 |
| --- | --- | --- |
| Electron / React / NestJS / SQLite 분리 | 화면·업무 로직·저장소를 나눌 기본 골격이 이미 있습니다. 프레임워크 교체보다 연결 규칙 정비가 먼저입니다. | [J04](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/desktop/src/main.ts) / [J10](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/database/database.module.ts) / [J16](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/package.json) |
| `Company`와 `CompanyBusiness` 분리 | 회사 자체 정보와 ‘이 회사가 이 사업에서 어떤 상태인가’를 분리했습니다. 새 참여자 모델의 기준으로 삼습니다. | [J05](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/companies/company-business.entity.ts) |
| 전역 세션 인증과 역할 Guard | 인증이 전혀 없는 프로젝트가 아닙니다. 기존 인증을 유지하고 사업·개별 자료에 대한 접근검사를 추가합니다. | [J07](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/auth/auth.module.ts) / [J08](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/auth/roles.guard.ts) |
| AI 추출값과 검토값 구분 | 사람이 수정한 값을 별도로 관리하려는 의도는 적절합니다. 다만 버전과 수정이력을 보강해야 합니다. | [J11](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/document.entity.ts) / [J12](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/documents.service.ts) |
| 공통 API 래퍼와 입력 검증 | 요청·응답과 DTO를 통일할 출발점입니다. 기존 `ApiResponse`를 불필요하게 바꾸지 않습니다. | [J06](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/main.ts) / [J15](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/renderer/src/api/client.ts) |

## 3. 우선순위가 높은 진단

P0는 실자료 도입 전에 해결해야 하는 항목, P1은 핵심 흐름 완성과 함께 해결할 항목입니다. 사용자의 현재 장애 등급을 측정한 표가 아닙니다.

### F01. 사업을 선택하는 화면과 사업별 데이터 격리는 별개입니다 — P0

**확인:** `Worker`와 `Document`에 `businessId`가 없습니다. `DocumentsService.findAll`, `findOne`, `exportReport`는 사업 범위를 받지 않습니다. 문서 화면도 `documentsApi.list()`를 호출하며 사업 전환을 구독하지 않습니다. [J09](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/workers/worker.entity.ts) / [J11](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/document.entity.ts) / [J12](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/documents.service.ts) / [J13](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/renderer/src/pages/DocumentsPage.tsx)

**해석:** 상단에서 다른 사업을 선택해도 문서·근로자·산정 자료의 경계가 일관되게 적용되지 않을 수 있습니다. 이는 화면 필터만으로 해결되지 않습니다.

**제안:** 승인된 참여기록을 기준으로 사업 범위를 결정하고, 목록·상세·다운로드·수정·삭제·엑셀·메일 발송에 같은 접근검사를 적용합니다. 임의의 `businessId`를 보내는 것만으로 접근을 허용하지 않습니다.

**재현할 테스트:** 사업 A 전용 담당자가 사업 B의 문서 ID를 직접 요청한다. 목록뿐 아니라 상세·보고서·원본 다운로드·재분석도 차단되는지 확인한다.

### F02. 로그인·역할 검사만으로 사업 배정 권한은 보장되지 않습니다 — P0

**확인:** `AuthModule`은 `SessionAuthGuard`와 `RolesGuard`를 전역 등록합니다. `RolesGuard`는 필요한 역할 메타데이터가 없으면 통과합니다. 기업 Controller는 `businessId`를 서비스에 전달하지만, 읽은 Controller에서 사업 배정 검사나 기관 경계 검사는 확인되지 않습니다. [J07](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/auth/auth.module.ts) / [J08](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/auth/roles.guard.ts) / [J14](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/companies/companies.controller.ts)

**해석:** ‘로그인했다’와 ‘이 사업 자료를 볼 수 있다’는 다른 조건입니다. 전역 인증이 있다는 사실을 놓치고 “인증 없음”으로 진단해서도 안 됩니다.

**제안:** `SessionAuthGuard → BusinessAccessGuard → 리소스 소속 검증 → Capability 검사`로 구분합니다. 기업 원장 전체 열람·병합·삭제 같은 기관 공용 작업은 별도 권한이 필요합니다. 전체 서비스의 우회 경로 여부는 단계 M0에서 추가 점검합니다.

### F03. 재분석 결과와 과거 검토값이 섞일 수 있습니다 — P1

**확인:** `DocumentsService.analyze()`는 `extractedData`, 상태, 분석일을 갱신하지만 기존 `reviewedData`의 버전을 관리하거나 무효화하지 않습니다. 화면의 `getMissingItems`와 보고서는 `reviewedData ?? extractedData`를 우선 사용합니다. [J12](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/documents.service.ts) / [J13](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/renderer/src/pages/DocumentsPage.tsx)

**해석:** 과거 검토값이 있으면 새 AI 결과가 생겨도 과거 검토의 미비사항이 계속 표시될 수 있습니다. 이는 정적 코드 경로로 확인되는 결함 후보입니다.

**제안:** 이전 검토값을 삭제하는 대신 `ExtractionRun`, `FieldCorrection`, `ValidationRun`, `ReviewDecision`을 버전별로 보존합니다. 새 증빙·새 추출 결과를 현재 심사의 입력으로 채택할 때 `dataRevision`을 증가시키고 이전 검토결정을 재사용하지 못하게 합니다.

**재현할 테스트:** 문서 검토 완료 → 수정된 문서/결과로 재분석 → 이전 승인 표시가 유지되지 않고 재검토가 필요한지 확인한다.

### F04. 미분석·실패 자료가 ‘미비 없음’으로 보고될 수 있습니다 — P0

**확인:** `exportReport()`는 분석 데이터나 `missingItems`가 없으면 빈 배열로 바꾸고, 길이가 0이면 `hasMissingItems: '없음'`으로 출력합니다. 상태 필터 없이 전체 문서를 가져옵니다. [J12](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/documents.service.ts)

**해석:** ‘검사하지 못함’과 ‘검사했는데 문제없음’이 동일하게 표시될 수 있습니다.

**제안:** 보고서 열을 `처리상태 / 필수서류 충족상태 / 규칙결과 / 실무자 결정`으로 분리합니다. 미분석·분석실패·규칙 미실행은 반드시 `판정 불가`입니다. 비어 있는 결과 목록을 통과로 보지 않습니다.

### F05. 현재 산정식은 사업별 지원금 검증식이 아닙니다 — P0

**확인:** 현재 `SubsidyService.calculate()`는 `salary / 30`에 `workedDays`를 곱해 반올림합니다. 직전 비교 기준도 같은 `workerId`의 최신 산정 1건입니다. 사업별 정책·회차 식별·서류 간 검증은 이 계산 경로에 없습니다. [J17](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/subsidy/subsidy.service.ts)

**해석:** 일할 급여 계산에 가까운 로직을 공식 지원금 산정으로 오해할 수 있습니다. 입사일에 N개월을 더한 안내일 도래 역시 최종 자격 충족을 뜻하지 않습니다.

**제안:** 기존 기록은 `LEGACY_CALCULATION`으로 보존하고 공식 지급판정에 사용하지 않습니다. `SubsidyClaim`의 사업·참여기록·기간·회차에 연결하고, 승인된 지침 버전으로 새 계산을 수행합니다. 실제 지급률·상한·기산일·반올림 방식은 원문과 담당자 확인 전 채워 넣지 않습니다.

### F06. 규칙엔진 인터페이스가 ‘통과/실패’만 표현합니다 — P1

**확인:** `DomainValidationResult`는 `field`, `passed: boolean`, `message?`로 구성되어 있고 구현·호출하지 않는 자리라는 주석이 있습니다. 내부 갭분석도 실제 검증엔진 부재를 적시합니다. [J18](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/common/domain-validation-engine.interface.ts) / [J02](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/04_%ED%98%84%ED%99%A9_%EA%B0%AD%EB%B6%84%EC%84%9D.md)

**해석:** 서류 미제출, 해석 불가, 수동확인 필요, 해당 없음과 실제 부적격을 구분하기 어렵습니다.

**제안:** 업무판정은 `PASS / FAIL / NEEDS_REVIEW / INSUFFICIENT_DATA / NOT_APPLICABLE`, 기술 실행은 `SUCCEEDED / FAILED`로 분리합니다. 각각 규칙 ID·버전·입력 증빙·근거를 저장합니다.

### F07. AI 응답은 구조가 고정되지 않은 JSON입니다 — P1

**확인:** Gemini 프롬프트는 문서 종류와 항목을 스스로 정하게 하고 `responseMimeType`만 JSON으로 지정합니다. `JSON.parse()` 이후 서류별 구조 검증은 읽은 함수에 없습니다. [J19](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/gemini.service.ts)

**해석:** 같은 서류도 필드명이 달라질 수 있고, JSON이라는 이유만으로 검증엔진의 정상 입력이 되는 것은 아닙니다. 한 문서의 분석만으로 전체 신청 건의 필수서류 누락을 확정할 수도 없습니다.

**제안:** 서류 코드·추출 스키마·버전·값의 타입·근거 위치를 고정합니다. AI 미비사항은 `aiObservations`로 남기고, 제출 여부는 Case의 필수서류 목록과 연결된 실제 증빙으로 판단합니다.

### F08. 메일 재수집 시 중복·누락을 통제할 영속 기록이 부족합니다 — P1

**확인:** 수집기는 안 읽은 메일을 조회하고, 첨부마다 새 UUID 파일을 저장한 뒤 처리 마지막에 읽음 표시를 합니다. 읽은 함수에서 메시지·첨부 단위 영속 중복키는 확인되지 않습니다. 발신자 이메일은 `findOne`으로 기업을 먼저 매칭합니다. [J20](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/mail-collector/mail-collector.service.ts)

**해석:** 여러 첨부 중간에서 실패한 뒤 재시도하면 이미 저장한 첨부가 중복될 수 있습니다. 읽음 표시는 다른 메일 프로그램에서도 바뀌며, 하나의 이메일이 여러 회사·사업과 관련될 수 있습니다.

**제안:** 계정·메일함·UIDVALIDITY·UID·첨부 식별자로 접수 원장을 만들고, 사업/참여 대상이 모호하면 ‘미분류 접수함’에 둡니다. 발신자 매칭은 소속 후보이지 권한 증명이나 자동 적격판정이 아닙니다.

### F09. 개발 DB 자동 변경과 배포 DB 생성 방식이 다릅니다 — P0

**확인:** DB 설정은 production 외에는 `synchronize: true`이고, 읽은 설정에 마이그레이션 등록이 없습니다. 내부 갭분석도 배포본의 스키마 생성 위험을 적시합니다. [J10](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/database/database.module.ts) / [J02](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/04_%ED%98%84%ED%99%A9_%EA%B0%AD%EB%B6%84%EC%84%9D.md)

**제안:** 빈 DB용 최초 마이그레이션과 기존 DB용 검증된 기준선 등록을 구분합니다. 기존 DB에 최초 CREATE를 다시 실행하거나 존재하지 않은 변경을 ‘실행됨’으로만 기록하면 안 됩니다. 스키마 fingerprint 확인 → 백업 → 복제본 이관 → 검증 순서입니다. TypeORM의 변경 이력 기반 마이그레이션 방식을 참고합니다. [T01](https://typeorm.io/docs/migrations/why/)

### F10. 설치형과 사내망형 접속 방식이 혼재합니다 — P1

**확인:** Electron은 개발 중 5173을, 배포 시 로컬 파일을 로드합니다. API 클라이언트는 기본 `http://localhost:3000`을 사용합니다. 논문은 동시에 ‘기관 내부 서버 1대 + 각 PC 브라우저 접속’을 설명합니다. [J04](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/desktop/src/main.ts) / [J15](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/renderer/src/api/client.ts) / [P01](#thesis)

**해석:** 다른 PC의 브라우저에서 `localhost`는 서버 PC가 아니라 사용자 PC입니다. 배포 구성을 먼저 선택해야 API 주소·쿠키·포트·파일 저장 위치를 일관되게 정할 수 있습니다.

**제안:** 첫 검증 배포의 제안 기본값은 `LOCAL_DESKTOP`입니다. 실제 목표가 다인 동시 사용이면 M0에서 `INSTITUTION_SERVER`로 바꿔 확정합니다. 두 모드를 동시에 급히 완성하지 않습니다.

### F11. Electron 배포본의 백엔드 기동은 아직 TODO입니다 — P1

**확인:** `apps/desktop/src/main.ts`에 NestJS 동봉 기동 TODO가 있습니다. [J04](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/desktop/src/main.ts)

**제안:** 서버 프로세스 시작·준비 확인·포트 충돌·종료·로그·절대 데이터 경로까지 한 묶음으로 검증합니다. 사용자가 따로 개발 명령을 실행해야 한다면 설치형 배포 완료가 아닙니다.

### F12. 로컬 저장은 외부 비전송과 같지 않습니다 — P0

**확인:** `extractFromPdf()`는 PDF 원본/변환본 바이트를 Base64로 외부 API에 전송하며, JSON 파싱 실패 때 응답 전체를 로그에 기록합니다. 읽은 전송 경로에 마스킹 단계는 없습니다. SMTP·IMAP도 외부 통신 경로입니다. [J19](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/gemini.service.ts) / [J20](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/mail-collector/mail-collector.service.ts)

**해석:** ‘데이터가 모두 기관 내부에서만 처리된다’는 설명은 현재 전송 경로와 맞지 않습니다. 내부 갭분석의 ‘외부 통신은 AI뿐’이라는 문구도 메일·공고 연동을 모두 표현하지는 않습니다. [J02](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/04_%ED%98%84%ED%99%A9_%EA%B0%AD%EB%B6%84%EC%84%9D.md)

**제안:** 외부 AI는 기본 비활성화하고 합성자료부터 테스트합니다. 실자료는 전송정책 확정·승인된 비식별 처리·전송본 검토·반출 기록 없이는 보내지 않습니다. 단순 화면 가림이나 텍스트 일부 치환을 완전한 비식별화라고 부르지 않습니다. 엄격한 내부 완결 요건이면 AI도 내부에서 처리해야 합니다.

### F13. 세션 보안은 배포 모드에 맞게 강화해야 합니다 — P0

**확인:** `main.ts`는 모든 Origin을 반사하는 CORS와 credentials를 허용하고, 환경변수가 없으면 개발용 세션 secret을 사용합니다. 세션 store, secure, sameSite를 명시하지 않습니다. [J06](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/main.ts)

**제안:** 운영 secret 필수화, 승인 Origin/Host 제한, CSRF 대책, 세션 저장·만료 정책, 로그인 제한을 적용합니다. 로컬 모드의 loopback HTTP와 사내망 HTTPS의 쿠키 설정을 동일하게 복사하지 않습니다. 로컬 포트도 무조건 안전하다고 보지 않습니다.

### F14. 큰 개편보다 회귀 방지 장치가 먼저입니다 — P1

**확인:** 서버 package에는 `jest`와 `lint --fix`가 있습니다. 테스트 실행 결과는 확보하지 못했습니다. [J16](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/package.json)

**제안:** 테스트가 설치되어 있다는 사실과 테스트가 실제로 통과했다는 사실을 구분합니다. 첫 단계에서 진단용 `lint:check`와 핵심 회귀 테스트를 만들고, `--passWithNoTests`, 검증 삭제, `any` 남발로 통과시키지 않습니다. 자동 수정 lint는 순수 진단 단계에서 실행하지 않습니다.

## 4. CiviCRM을 어떻게 참고했는가

### 4.1 선정의 의미

CiviCRM은 **업무모델을 참고할 주 참조 사례**로 선택했습니다. 전 세계 프로그램을 전수 비교해 ‘가장 유사하다’고 입증한 것은 아닙니다. 현재 기술 스택과 동일한 애플리케이션도 아닙니다. PHP 기반 코드를 NestJS에 가져다 붙이는 방식은 권장하지 않습니다.

공식 가이드는 CiviCase를 여러 활동을 묶어 처리하는 구조로 설명하며, CiviGrant는 지급하는 보조금 신청·금액·보고를 관리하고 복잡한 흐름에는 CiviCase와 병행할 수 있다고 설명합니다. CiviGrant는 공식 설명상 5.46부터 확장 기능 형태로 배포됩니다. [C07](https://docs.civicrm.org/user/en/latest/case-management/set-up/) / [C08](https://docs.civicrm.org/user/en/latest/grants/what-is-civigrant/)

### 4.2 실제로 읽은 소스 → 관찰 → 채택 여부

| 실제 파일 | 직접 확인한 구조 | 잡도리에서의 해석·적용 | 쉬운 설명 |
| --- | --- | --- | --- |
| `schema/Case/Case.entityType.php` | `case_type_id`, `subject`, `start_date`, `end_date`, `status_id` | `WorkCase`에 심사 종류·제목·상태·접수일을 둡니다. | 신청 1건을 서류철처럼 묶습니다. [C01](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Case/Case.entityType.php) |
| `schema/Case/CaseActivity.entityType.php` | `case_id + activity_id` 고유 결합, 연결 테이블 | 초기 잡도리는 Activity 하나를 Case 하나에 연결하는 1:N으로 단순화합니다. | 반복 기록을 막되 CiviCRM의 범용 N:M까지 복제하지 않습니다. [C02](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Case/CaseActivity.entityType.php) |
| `schema/Case/CaseType.entityType.php` | 기계명 `name`, 화면명 `title`, 활성 여부, `definition` | 업무 코드와 한글 표시명을 분리합니다. 범용 XML 편집기는 도입하지 않습니다. | 화면 이름을 바꿔도 저장된 분류 코드가 바뀌지 않게 합니다. [C03](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Case/CaseType.entityType.php) |
| `schema/Activity/Activity.entityType.php` 일부 | 활동 종류·상태·시점·우선순위·설명 | MVP는 완료된 업무 사실을 기록하는 간단한 Activity만 사용합니다. 일정·할당 Task는 이후 확장합니다. | 언제 누가 보완요청·검토를 했는지 남깁니다. [C04](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Activity/Activity.entityType.php) |
| `CRM/Case/BAO/Case.php` 1–200행 | Case/Activity 연결, 제목의 Case 표식 처리, 연결 중복 처리 | 메일과 심사 건의 연결 개념만 참고합니다. 제목에 번호가 있다는 이유만으로 자동 연결하지 않습니다. | 회신이 어느 서류철인지 찾되, 발신자·기관·사업을 다시 확인합니다. [C05](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/CRM/Case/BAO/Case.php) |
| `ext/civigrant/schema/Grant.entityType.php` | 신청접수일·결정일·이체일과 요청금액·결정금액이 분리됨 | `SubsidyClaim`에서 신청·예상·승인·지급 금액과 상태를 구분합니다. | 계산한 금액과 실제 준 금액은 다른 사실입니다. [C06](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/ext/civigrant/schema/Grant.entityType.php) |

이 대조는 **소스 기반 정적 구조 역분석**입니다. CiviCRM을 실행해 모든 화면·플러그인·성능을 시험한 결과는 아닙니다.

### 4.3 가져오지 않는 것

| 제외 대상 | 제외 이유 |
| --- | --- |
| CiviCRM 전체 Contact 통합 테이블 | 현재 Company/Worker를 통합하면 이관 범위가 지나치게 커집니다. 원장과 업무 건을 분리하는 원칙만 참고합니다. |
| Campaign = Business라는 1:1 대응 | 비슷한 묶음 개념일 수 있지만, 한국 일자리사업의 연도·운영기관·지침 버전과 동일한 객체라고 검증하지 않았습니다. |
| CaseType 설정 = 지침 검증엔진 | 업무 순서를 정하는 기능과 서류의 자격 요건을 판정하는 기능은 다릅니다. 검증엔진은 본 프로젝트가 자체 설계합니다. |
| 모든 Activity의 N:M 공유 | 권한 경계와 구현 복잡도가 증가합니다. 초기 버전은 Case별 기록이 충분합니다. |
| 삭제 CASCADE를 그대로 복제 | 지원금 심사 증빙은 삭제보다 보존·정정·취소 이력이 중요합니다. 잡도리는 승인 근거의 삭제를 제한합니다. |
| 범용 워크플로 디자이너·플러그인 생태계 | 현장실습훈련 한 사업의 검증 파이프라인 완성이 먼저입니다. |
| 원본 PHP 구현의 복사 | 기술 스택과 라이선스 확인이 별도 필요합니다. 이번 산출물은 구조 해석과 독자 설계입니다. |

### 4.4 라이선스와 출처 표시

읽은 Case 처리 코드의 헤더는 AGPLv3와 허용 예외를 명시합니다. 실제 코드를 가져오는 작업은 이번 산출물에 포함하지 않았습니다. 향후 코드 재사용 시 해당 파일·확장의 정확한 라이선스와 배포 방식을 검토하고 출처·변경 이력을 남겨야 합니다. 단순히 공개 저장소라는 이유로 무제한 복제 가능하다고 간주하지 않습니다. [C05](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/CRM/Case/BAO/Case.php) / [C09](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/CRM/Case/BAO/Case.php#L1-L10)

## 5. 논문 요구사항과 설계 변경의 대응

| 요구사항 | 이번 설계의 구현 책임 | 쉬운 설명 |
| --- | --- | --- |
| REQ1 자동 수집·구조화 | 접수 원장, 파일 버전, 변환 Job, 서류별 추출 스키마 | 서류가 들어온 때부터 어떤 값이 추출됐는지 추적합니다. |
| REQ2 교차검증 | WorkCase 단위 입력 스냅샷과 ValidationRun | 한 파일이 아니라 한 신청 건의 여러 서류를 비교합니다. |
| REQ3 규칙화 | PolicyVersion, 제한된 규칙 연산자, 출처·발행 절차 | 이미 지원하는 규칙 표현 안에서는 지침 값을 코드 변경 없이 바꿉니다. 전혀 새로운 계산 방식은 개발이 필요할 수 있습니다. |
| REQ4 최종 검토 | FieldCorrection, ReviewDecision, 승인 시 버전검사 | 사람이 수정하고 승인한 근거를 남기며, 이후 서류가 바뀌면 다시 검토합니다. |
| REQ5 내부 완결형 처리 | 저장 위치와 외부 전송 정책을 별도 검증 | 로컬 DB만 보고 ‘외부 비전송 완료’라고 판단하지 않습니다. |

첨부 논문의 인쇄 쪽수 28–35(요구사항·범위·검증엔진·검토 화면), 38–40(현재 아키텍처와 구현 현황)을 참고했습니다. 이 표의 새 객체와 구현 방법은 논문의 원문을 그대로 요약한 것이 아니라, 해당 요구사항을 구현하기 위한 **제안 설계**입니다. [P01](#thesis)
