# 잡도리 AI v2 — 근거 자료와 검토 범위

작성일: 2026-10-15

본문의 `[Jxx]`는 사용자 저장소, `[Cxx]`는 CiviCRM, `[Txx]`는 공식 기술문서, `[P01]`은 첨부 논문입니다. 각 문장 옆의 코드로 실제 근거를 확인할 수 있습니다.

사용자 저장소는 `d9dc635a04ff5c76a8ef544547935a79b6ec770c`, CiviCRM은 `f49ccf2635d072c7afbecb635147d1b0838883e4`로 고정했습니다. 바뀌는 master 링크만 기록하는 대신 당시 소스를 확인할 수 있는 링크를 사용했습니다. 공식 사용자 가이드는 최신 경로이므로 이후 내용이 바뀔 수 있습니다.

**검토 방법:** GitHub 연결을 통해 핵심 파일을 정적으로 조회하고 공식 설명과 대조했습니다. 전체 프로그램 실행, 전체 코드의 결함 부재 증명, 성능 측정은 하지 않았습니다. 로컬 clone은 실행 환경의 네트워크 제약으로 받지 못했으며, 근거는 성공적으로 조회한 연결 도구의 파일 본문입니다. J01/J03은 앞선 대화에서 조회한 본문과 이번 저장소 트리의 동일 파일 이력을 함께 참고했습니다.

**일반 설계와 구분:** 새 테이블 이름, 필드, 단계 M0~M8, 권한 정책, 재시도 방식, 테스트 케이스는 출처의 기능이 이미 존재한다는 주장이 아니라 이 프로젝트를 위한 제안입니다.

| ID | 근거 경로·공식 URL | 이 문서에서 확인한 내용 |
| --- | --- | --- |
| J00 | [https://github.com/master2024jsw/job-program-platform/commit/d9dc635a04ff5c76a8ef544547935a79b6ec770c](https://github.com/master2024jsw/job-program-platform/commit/d9dc635a04ff5c76a8ef544547935a79b6ec770c) | 검토한 사용자 저장소 기준 커밋. 2026-09-29 Update .env.example |
| J01 | [docs/01_업무프로세스_자동화매핑.md](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/01_%EC%97%85%EB%AC%B4%ED%94%84%EB%A1%9C%EC%84%B8%EC%8A%A4_%EC%9E%90%EB%8F%99%ED%99%94%EB%A7%A4%ED%95%91.md) | 서로 다른 9단계의 구분, 논문 1차 범위, REQ1~5 |
| J02 | [docs/04_현황_갭분석.md](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/docs/04_%ED%98%84%ED%99%A9_%EA%B0%AD%EB%B6%84%EC%84%9D.md) | 내부 진단의 작성일·기준 커밋·11월 목표와 구현 공백 |
| J03 | [05_실행계획_사업스코프확장.md](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/05_%EC%8B%A4%ED%96%89%EA%B3%84%ED%9A%8D_%EC%82%AC%EC%97%85%EC%8A%A4%EC%BD%94%ED%94%84%ED%99%95%EC%9E%A5.md) | 사업별 서류·권한 확장 계획. 일괄 배정은 이번 설계에서 조건부/미분류 원칙으로 보완 |
| J04 | [apps/desktop/src/main.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/desktop/src/main.ts) | Electron UI 로딩, 보안 기본값, 백엔드 동봉 기동 TODO |
| J05 | [apps/server/src/modules/companies/company-business.entity.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/companies/company-business.entity.ts) | 기업 원장과 사업별 기업정보 분리, 고유 조합 |
| J06 | [apps/server/src/main.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/main.ts) | CORS, 세션 쿠키, 시크릿 기본값, 서버 listen |
| J07 | [apps/server/src/modules/auth/auth.module.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/auth/auth.module.ts) | SessionAuthGuard와 RolesGuard의 전역 등록 |
| J08 | [apps/server/src/modules/auth/roles.guard.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/auth/roles.guard.ts) | 역할 메타데이터가 있을 때의 역할 확인 |
| J09 | [apps/server/src/modules/workers/worker.entity.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/workers/worker.entity.ts) | 개인·고용정보 혼재, 사업 ID 없음 |
| J10 | [apps/server/src/database/database.module.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/database/database.module.ts) | 환경별 synchronize, 경로 설정. 운영 migration 등록 없음 |
| J11 | [apps/server/src/modules/documents/document.entity.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/document.entity.ts) | 단일 extractedData/reviewedData와 파일 경로 |
| J12 | [apps/server/src/modules/documents/documents.service.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/documents.service.ts) | 재분석·보고서·원본삭제·사업범위 관련 흐름 |
| J13 | [apps/renderer/src/pages/DocumentsPage.tsx](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/renderer/src/pages/DocumentsPage.tsx) | 검토값 우선 사용과 최초 목록 로딩. 이번 재조회 1~70행 |
| J14 | [apps/server/src/modules/companies/companies.controller.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/companies/companies.controller.ts) | 선택적 businessId, 일괄 작업과 단건 API |
| J15 | [apps/renderer/src/api/client.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/renderer/src/api/client.ts) | localhost API 기본값, 성공 응답과 204 처리 관계 |
| J16 | [apps/server/package.json](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/package.json) | 현재 의존성 범위와 build/test/lint 스크립트. 통과 여부는 미검증 |
| J17 | [apps/server/src/modules/subsidy/subsidy.service.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/subsidy/subsidy.service.ts) | 전역 설정, 입사일+개월 안내, 급여/30×근로일수 산정 |
| J18 | [apps/server/src/common/domain-validation-engine.interface.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/common/domain-validation-engine.interface.ts) | 미구현 자리표시와 passed:boolean 계약 |
| J19 | [apps/server/src/modules/documents/gemini.service.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/gemini.service.ts) | 범용 JSON 추출, PDF 외부 전송, 실패 응답 로그 |
| J20 | [apps/server/src/modules/mail-collector/mail-collector.service.ts](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/mail-collector/mail-collector.service.ts) | IMAP 미확인 메일 수집, 첨부 저장, Seen 처리, 단순 발신자 매칭 |
| C00 | [https://github.com/civicrm/civicrm-core/commit/f49ccf2635d072c7afbecb635147d1b0838883e4](https://github.com/civicrm/civicrm-core/commit/f49ccf2635d072c7afbecb635147d1b0838883e4) | CiviCRM 정적 역분석 기준 커밋 |
| C01 | [schema/Case/Case.entityType.php](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Case/Case.entityType.php) | 업무 목적별 Case: 유형·상태·제목·기간 |
| C02 | [schema/Case/CaseActivity.entityType.php](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Case/CaseActivity.entityType.php) | Case와 Activity 연결 및 조합 고유 제약 |
| C03 | [schema/Case/CaseType.entityType.php](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Case/CaseType.entityType.php) | 업무유형 코드/화면명/활성화/정의 분리 |
| C04 | [schema/Activity/Activity.entityType.php](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/schema/Activity/Activity.entityType.php) | 활동 유형·시점·상태·우선순위. 조회 범위 1~240행 |
| C05 | [CRM/Case/BAO/Case.php](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/CRM/Case/BAO/Case.php) | 업무 건·활동 연결 처리. 조회 범위 1~200행 |
| C06 | [ext/civigrant/schema/Grant.entityType.php](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/ext/civigrant/schema/Grant.entityType.php) | 신청일·결정일·이체일과 신청액·승인액 분리 |
| C07 | [https://docs.civicrm.org/user/en/latest/case-management/set-up/](https://docs.civicrm.org/user/en/latest/case-management/set-up/) | 공식 Case 구성 가이드. 유형·활동·타임라인 설정 |
| C08 | [https://docs.civicrm.org/user/en/latest/grants/what-is-civigrant/](https://docs.civicrm.org/user/en/latest/grants/what-is-civigrant/) | 공식 CiviGrant 설명. 신청·지원금·보고, 5.46부터 확장 기능 |
| C09 | [https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/CRM/Case/BAO/Case.php#L1-L10](https://github.com/civicrm/civicrm-core/blob/f49ccf2635d072c7afbecb635147d1b0838883e4/CRM/Case/BAO/Case.php#L1-L10) | 파일 헤더의 AGPLv3·허용 예외 안내. 라이선스 법률 판정은 아님 |
| T01 | [https://typeorm.io/docs/migrations/why/](https://typeorm.io/docs/migrations/why/) | 공식 마이그레이션 설명. 실제 구현은 프로젝트의 TypeORM 0.3 설치버전과 대조 필요 |
| T02 | [https://www.electronjs.org/docs/latest/tutorial/security](https://www.electronjs.org/docs/latest/tutorial/security) | 공식 Electron 보안 체크리스트. 설정·origin·격리 원칙 참고 |
| T03 | [https://www.sqlite.org/backup.html](https://www.sqlite.org/backup.html) | 공식 SQLite 온라인 백업 API 설명 |

## P01. 첨부 논문

제목: **AI 기반 재정지원 일자리사업 업무자동화 솔루션 설계: 현장실습훈련 사업을 중심으로**

첨부 파일: `재정지원 일자리사업 업무자동화 AI 솔루션 개발ver.11.pdf` · 55쪽 · 표지 2026년 9월.

| 참고 위치 | 사용한 내용 |
| --- | --- |
| 인쇄 28~29쪽 / PDF 33~34쪽 | REQ1~REQ5, 현장실습훈련 중심의 1차 범위, 사람의 최종 판단 |
| 인쇄 30~33쪽 / PDF 35~38쪽 | 업무 단계, AI 추출과 검증의 구분, 네 가지 규칙 유형 |
| 인쇄 34~35쪽 / PDF 39~40쪽 | 실무자 검토, 원본 대조, 보정·승인 이력 |
| 인쇄 38~40쪽 / PDF 43~45쪽 | Electron·NestJS·SQLite 구성, 외부 AI 분석, 구현 중인 엔진·이력 |
| 인쇄 42~43쪽 / PDF 47~48쪽 | 정상 서류 중심의 분석 확인, 미비서류 후속 검증, 수동 메일 발송 시험 |

저장소 갭분석은 논문 ver.12를 비교 기준으로 적고 있습니다. 이 패키지는 그 문서에 적힌 사실과 실제 첨부된 ver.11의 본문을 구별했으며, ver.12 원문을 확보한 것처럼 처리하지 않았습니다.

## 출처 해석 시 주의

현재 지원금 산정식이 코드에 존재한다는 사실은 그 식이 실제 운영지침에 맞다는 뜻이 아닙니다. CiviCRM의 Grant 필드는 국내 지원금의 금액·자격기준을 제공하지 않습니다. 외부 API의 구체적인 개인정보 보존·무저장 계약 조건도 이번 검토에서 확인하지 않았습니다.

오픈소스 파일을 이 패키지에 복제하지 않았습니다. CiviCRM의 구조를 참고한 범위와 이 프로젝트에서 별도로 설계한 부분은 진단서의 역분석 대응표에 나누어 적었습니다.
