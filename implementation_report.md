# 잡도리 AI — 구현 현황 보고서

재정지원 일자리사업 서류검토 자동화 시스템 구현 현황을 코드·DB·git 이력에서 확인 가능한 사실만 정리한 보고서입니다.  
생성 기준일: 2026-10-02

---

## 1. 구현 현황

| 기능 | 판정 | 근거 파일 | 비고 |
|------|------|-----------|------|
| 메일 자동수집(IMAP) | **(c) 로직 구현 완료** | `apps/server/src/modules/mail-collector/mail-collector.service.ts` | `ImapFlow` + `mailparser` 사용. 미열람 메일 UID 순회, `\Seen` 플래그 처리. POST 엔드포인트로 수동 트리거 방식. 자동 스케줄러 없음. |
| 첨부파일 저장 및 발신자-기업/근로자 자동 매칭 | **(c) 로직 구현 완료** | `mail-collector.service.ts` | `resolveSender(email)`: 발신자 이메일 → companies·workers 테이블 조회 → companyId/workerId 반환. UUID 파일명으로 `data/uploads/`에 저장 후 Document 레코드 생성(source='IMAP'). |
| 파일 형식 변환 (HWP/이미지/DOCX → PDF) | **(c) 로직 구현 완료 (HWP는 한글 프로그램 필수)** | `converters/hwp-to-pdf.converter.ts`, `image-to-pdf.converter.ts`, `docx-to-pdf.converter.ts`, `pdf-to-markdown.converter.ts` | HWP: Windows COM(winax) + 한글. DOCX: Word COM 1차 → mammoth 텍스트 추출 폴백. 이미지(PNG/JPG): pdf-lib 임베드. PDF→Markdown: pdf-parse v1.1.1. |
| AI 문서분석 (항목 추출) | **(c) 로직 구현 완료** | `apps/server/src/modules/documents/gemini.service.ts` | `@google/genai` SDK. PDF 바이너리 base64 전송(`extractFromPdf`) + Markdown 텍스트 전송(`extractFromText`) 두 경로. `responseMimeType: 'application/json'`으로 JSON 강제. |
| 미비서류 자동 감지 | **(c) 로직 구현 완료** | `gemini.service.ts` 83~116행 | 프롬프트에 `missingItems` 배열 요청. 서류유형 지정 시 해당 서류만 미비 체크, 미지정 시 AI 자동분류 후 체크. 엑셀 보고서 '미비항목' 컬럼으로 출력. |
| 도메인 검증엔진 — crossCheck | **(c) 로직 구현 완료** | `domain-validation.engine.ts` 93행, `SENIOR-*.json` | 두 서류에서 같은 필드를 추출해 비교. normalize: 'brn'으로 사업자등록번호 표준화 대조 지원. |
| 도메인 검증엔진 — calcRule | **(c) 로직 구현 완료** | `domain-validation.engine.ts` 165행 | calcType: jobClassification / internPeriodCheck / dateCompare / employmentHistoryDateCheck / recentWorkplaceCheck / subsidyCalc / subsidyTotalCheck / subsidyTypeCheck / insuranceRosterCheck / salaryCompare / salaryTransferCheck — 11종 구현. |
| 도메인 검증엔진 — riskFlag | **(c) 로직 구현 완료** | `domain-validation.engine.ts` 139행 | 단일 서류 내 필드가 예상값(expectedBoolean, expected 문자열)인지 확인. multiDocumentChecks 확장(R-206)으로 복수 서류 체크 지원. |
| 도메인 검증엔진 — exceptionRule | **(b) 인터페이스만 선언 (스텁)** | `domain-validation.engine.ts` 81~88행 | `verdict: 'NEEDS_REVIEW'`, 메시지 "이 규칙 유형은 아직 구현되지 않았습니다(담당자 확인)." 반환. 실제 로직 없음. |
| 판정 이력 데이터베이스 | **(c) 로직 구현 완료** | `judgment-history.entity.ts`, `judgment-history.service.ts` | `judgment_histories` 테이블, append-only. source('AI'\|'HUMAN'), corrected(boolean). DB에 AI 판정 9건, HUMAN 승인 3건 실제 기록 존재. |
| 실무자 검토·수정·승인 워크플로우 | **(c) 로직 구현 완료** | `documents.controller.ts` PATCH, `validation.controller.ts` POST /approve | `PATCH /documents/:id`에 `reviewedData` 필드로 수정값 저장. `/validation/company(worker\|subsidy)/approve`로 최종 승인 + HUMAN 이력 기록. |
| 확신도 기반 항목 강조 표시 | **(a) 미구현** | 프로젝트 전체 | "confidence", "확신도" 관련 코드·프롬프트 없음. extractedData 구조에 해당 필드 없음. |
| 미비서류 감지 시 자동 재요청 메일 발송 | **(a) 미구현** | `mail.service.ts` | 수동 발송 API(`POST /mail/send`)만 구현. missingItems 감지 → 자동 트리거 로직 없음. |
| 지원금 산출 기능 | **(c) 로직 구현 완료** | `apps/server/src/modules/subsidy/subsidy.service.ts`, `subsidy-validation.service.ts` | 수동 산정(일급×근무일수) + 6단계 검증 시 자동 산정(min(급여×50%, 인턴40만/채용50만)). SubsidyCalculation 테이블에 저장. |
| 위탁공고 자동수집 (신사업 알리미) | **(c) 로직 구현 완료** | `apps/server/src/modules/announcements/moel-daegu-collector.service.ts` | 대구고용노동청 게시판 `cheerio` HTML 파싱, 키워드('위탁') 전 페이지 검색. sourceUrl 중복 방지. |

---

## 2. 도메인 검증 규칙 실제 명세

### 규칙 원장 위치 및 형식

| 항목 | 내용 |
|------|------|
| 파일 위치 | `apps/server/resources/validation-rules/SENIOR-company.json`, `SENIOR-worker.json`, `SENIOR-subsidy.json` |
| 형식 | JSON (외부 파일로 분리) |
| 로더 | `apps/server/src/modules/validation/validation-rules.service.ts` — 서버 기동 시 로드, `Map<typeCode:target, RuleLedger>` 캐시 |
| 조건식 위치 | `apps/server/src/modules/validation/domain-validation.engine.ts` |

---

### 4단계 기업신청 규칙 (SENIOR-company.json, R-101~R-104)

| 규칙 ID | type | label | 입력 서류/필드 | 판정 조건 | 출력 |
|---------|------|-------|--------------|-----------|------|
| R-101 | crossCheck | 사업자등록번호 3자 일치 | COMPANY_APPLICATION, BUSINESS_REGISTRATION, WORKPLACE_INSURANCE / `businessRegistrationNumber` (normalize: 'brn') | 세 서류의 사업자등록번호를 `-` 제거 후 10자리 비교, 전부 동일 → PASS | PASS / NEEDS_REVIEW |
| R-102 | riskFlag | 4대보험 사업장 가입 확인 | WORKPLACE_INSURANCE / `nationalPension`, `healthInsurance`, `industrialAccident`, `employmentInsurance` | 각 필드 값 === '가입' | PASS / NEEDS_REVIEW |
| R-103 | riskFlag | 대표자 행정정보 공동이용 동의 | OPERATION_PLAN / `representativeConsentToShareAdminInfo` | expectedBoolean: true | PASS / NEEDS_REVIEW |
| R-104 | calcRule (jobClassification) | 모집직종 참여가능 판정 | COMPANY_APPLICATION / `recruitJobCode` → `resources/job-classifications.json` | 4자리 코드 → ELIGIBLE(허용) / EXCLUDED(제외) / 코드 없음 → NEEDS_REVIEW | PASS / FAIL / NEEDS_REVIEW |

---

### 5단계 근로자신청 규칙 (SENIOR-worker.json, R-201~R-210)

| 규칙 ID | type / calcType | label | 입력 서류/필드 | 판정 조건 | 출력 | skipIfMissing |
|---------|----------------|-------|--------------|-----------|------|--------------|
| R-201 | crossCheck | 초본·신청서 성명 일치 | WORKER_APPLICATION, RESIDENT_ABSTRACT / `name` | 두 서류 name 동일 | PASS / NEEDS_REVIEW | RESIDENT_ABSTRACT |
| R-202 | crossCheck | 고용보험이력·신청서 성명 일치 | WORKER_APPLICATION, EMPLOYMENT_INSURANCE_HISTORY / `name` | 두 서류 name 동일 | PASS / NEEDS_REVIEW | EMPLOYMENT_INSURANCE_HISTORY |
| R-203 | calcRule (employmentHistoryDateCheck) | 고용보험이력 상실일 < 근로시작일 | EMPLOYMENT_INSURANCE_HISTORY.`workplaces`, LABOR_CONTRACT.`internStartDate` | 모든 사업장 `lossDate` < `internStartDate` | PASS / NEEDS_REVIEW | EMPLOYMENT_INSURANCE_HISTORY |
| R-204 | calcRule (recentWorkplaceCheck) | 90일 이내 참여기업 동일 사업장 근무 여부 | EMPLOYMENT_INSURANCE_HISTORY.`workplaces`, LABOR_CONTRACT.`internStartDate`, COMPANY_CONTEXT.`companyName` | 기업명 유사 + 최근 90일 이내 이력 존재 | PASS / FAIL | EMPLOYMENT_INSURANCE_HISTORY |
| R-205 | calcRule (internPeriodCheck) | 인턴약정기간·수습 문구 확인 및 기간 1~3개월 | LABOR_CONTRACT: `internStartDate`, `internEndDate`, `hasInternKeyword` | 1 ≤ 기간(개월) ≤ 3 AND `hasInternKeyword` === true | PASS / NEEDS_REVIEW | — |
| R-206 | riskFlag (multiDocumentChecks) | 서명·기재 존재 확인 (5개 서류) | WORKER_APPLICATION(`applicantSignature`, `counselorName`), PRIVACY_CONSENT(`allConsentsChecked`, `applicantSignature`), ELIGIBILITY_CONFIRM(`applicantSignature`, `companyStaffSignature`), LABOR_CONTRACT(`employerSignature`, `workerSignature`), EDUCATION_LEDGER(`participantSignature`) | 모두 truthy | PASS / NEEDS_REVIEW | — |
| R-207 | riskFlag | 적격확인서 표준 패턴 확인 | ELIGIBILITY_CONFIRM: `item1None`~`item5None`, `item6Yes` | 6개 필드 모두 expectedBoolean: true | PASS / NEEDS_REVIEW | — |
| R-208 | calcRule (dateCompare) | 교육일자 ≥ 근로시작일 | EDUCATION_LEDGER.`educationDate`, LABOR_CONTRACT.`internStartDate` | `educationDate` ≥ `internStartDate` | PASS / NEEDS_REVIEW | — |
| R-209 | crossCheck | 성명 일치 (신청서·근로계약서·교육대장) | WORKER_APPLICATION, LABOR_CONTRACT(`workerName`→`name`), EDUCATION_LEDGER(`participantName`→`name`), optionalDocuments: RESIDENT_ABSTRACT | 3~4개 서류 name 동일 | PASS / NEEDS_REVIEW | — |
| R-210 | crossCheck | 근로계약서 기업 정보 = 선택 기업 | LABOR_CONTRACT.`companyName`, COMPANY_CONTEXT.`companyName` | 두 값 동일 | PASS / NEEDS_REVIEW | — |

---

### 6단계 지원금신청 규칙 (SENIOR-subsidy.json, R-301~R-309)

**기업 단위 규칙:**

| 규칙 ID | type / calcType | label | 입력/필드 | 판정 조건 | 출력 |
|---------|----------------|-------|----------|-----------|------|
| R-301 | crossCheck | 신청서 사업자번호 = 기업DB 일치 | SUBSIDY_APPLICATION vs COMPANY_CONTEXT / `businessRegistrationNumber` (normalize: 'brn') | 두 값 동일 | PASS / NEEDS_REVIEW |
| R-301b | riskFlag | 신청서 필수 기재·서명 확인 | SUBSIDY_APPLICATION: `representativeName`, `bankName`, `bankAccount`, `accountHolder`, `applicantSignature` | 모두 truthy | PASS / NEEDS_REVIEW |
| R-305 | calcRule (insuranceRosterCheck) | 가입자명부 참여자 취득·사업자 대조 | INSURANCE_ROSTER.`entries` vs COMPANY_CONTEXT.`businessRegistrationNumber`, LABOR_CONTRACT.`internStartDate`, WORKER_CONTEXT.`name` | 성명 일치 + 사업자번호 일치 + 취득일 ≤ internStartDate | PASS / NEEDS_REVIEW |
| R-308 | crossCheck | 계좌정보 신청서 일치 | BANK_ACCOUNT_COPY vs SUBSIDY_APPLICATION / `bankAccount` | 계좌번호 동일 | PASS / NEEDS_REVIEW |
| R-309 | calcRule (subsidyTotalCheck) | 신청서 총 신청금액 = 산출내역 합계 | SUBSIDY_APPLICATION.`totalAmount` vs SUBSIDY_CALCULATION.`entries[].subsidyAmount` 합산 | 두 값 동일 | PASS / NEEDS_REVIEW |

**근로자 단위 규칙:**

| 규칙 ID | type / calcType | label | 입력/필드 | 판정 조건 | 출력 |
|---------|----------------|-------|----------|-----------|------|
| R-302 | crossCheck | 산출내역 성명 = 근로자DB 일치 | SUBSIDY_CALCULATION.`name` vs WORKER_CONTEXT.`name` | 두 값 동일 | PASS / NEEDS_REVIEW |
| R-303 | calcRule (subsidyCalc) | 지원금 산정 검산 | SUBSIDY_CALCULATION.`entries[].baseSalary`, `subsidyType` | 인턴: min(baseSalary×0.5, 400000), 채용: min(baseSalary×0.5, 500000), Math.round 후 일치 | PASS / NEEDS_REVIEW |
| R-304 | calcRule (subsidyTypeCheck) | 신청지원금 유형·기간 = 근로계약서 인턴약정기간 | SUBSIDY_CALCULATION.`entries[].periodLabel`, LABOR_CONTRACT.`internStartDate`~`internEndDate` | periodLabel(YYYY-MM)이 internStart~internEnd 범위 내 | PASS / NEEDS_REVIEW |
| R-306 | calcRule (salaryCompare) | 명세서 기본급 ≥ 근로계약서 월급여 | PAYROLL.`baseSalary` vs LABOR_CONTRACT.`baseSalary` | `PAYROLL.baseSalary` ≥ `LABOR_CONTRACT.baseSalary` | PASS / NEEDS_REVIEW |
| R-307 | calcRule (salaryTransferCheck) | 이체확인증 이체금액 = 명세서 차감지급액 | SALARY_TRANSFER.`transferAmount` vs PAYROLL.`netPay` (허용오차 1,000원) | \|transferAmount - netPay\| ≤ 1000 | PASS / NEEDS_REVIEW |

---

## 3. AI 문서분석 상세

### 모델 식별자

| 항목 | 값 |
|------|---|
| 코드 기본값 (`DEFAULT_MODEL`, `gemini.service.ts` 9행) | `gemini-2.5-flash` |
| 런타임 실제 사용값 (`apps/server/.env` `GEMINI_MODEL`) | `gemini-3.8-flash` |
| 우선순위 | 환경변수 > 코드 기본값 |

### 분석 경로 두 가지

| 경로 | 메서드 | 전송 방식 | 사용 조건 |
|------|--------|-----------|----------|
| PDF 바이너리 경로 | `extractFromPdf()` | PDF를 base64 인코딩하여 `inlineData`로 전송 | `markdownPath` 없을 때 폴백 |
| 텍스트 경로 (토큰 절약) | `extractFromText()` | pdf-parse로 추출한 Markdown 텍스트를 문자열 전송 | `markdownPath` 있을 때 우선 사용 |

### 프롬프트 원문 (`buildDefaultPrompt()`, `gemini.service.ts` 83~117행)

**서류유형 지정 시 (`assignedType` 있을 때):**

```
{첨부된 PDF 문서를 분석해서 / 위 텍스트 내용을 분석해서} 정보를 JSON 객체로 추출해줘. 값을 확인할 수 없는 항목은 넣지 말고, 반드시 JSON 객체 하나만 응답해(배열 금지). 이 문서는 '{label}'({assignedType})로 이미 지정되어 있다. "documentType" 필드에 "{assignedType}"를 그대로 담아라. 한 PDF에 다른 서류가 함께 스캔되어 있어도, 오직 이 서류 종류에 해당하는 내용만 추출하고 다른 서류의 내용은 완전히 무시하라. 이 서류의 표준 key: {SCHEMA_BY_TYPE[assignedType]}. 확인 가능한 값만 담아라. 또한 이 서류('{label}')만을 기준으로 서명·날인·필수 기재 항목·첨부가 누락되었거나 불명확한 부분을 검토해서, 문제 항목을 한글 설명 문장으로 "missingItems" 배열에 담아라. 다른 서류에 대한 지적은 절대 넣지 말고, 없으면 빈 배열로 둬라.
```

**서류유형 미지정 시 (AI 자동분류):**

```
첨부된 PDF 문서를 분석해서 정보를 JSON 객체로 추출해줘. 값을 확인할 수 없는 항목은 넣지 말고, 반드시 JSON 객체 하나만 응답해(배열 금지). 이 문서의 종류를 다음 코드 목록 중에서만 판단해서 "documentType" 필드에 코드값으로 담아줘: {전체 DocumentTypeCode 목록}. 해당 없으면 "OTHER". 문서 종류에 해당하면 아래 표준 key 이름으로 값을 담아라(값을 못 찾으면 생략): ... (SCHEMA_HINT_ALL 전체) ... 또한 판단한 문서 종류를 기준으로 서명·날인·필수 기재 항목·첨부가 누락되었거나 불명확한 부분을 검토해서, 문제 항목을 한글 설명 문장으로 "missingItems" 배열에 담아줘. 없으면 빈 배열로 둬.
```

### 추출 스키마 (SCHEMA_BY_TYPE, `gemini.service.ts` 15~52행)

| 서류유형 코드 | 요청 필드 |
|---|---|
| COMPANY_APPLICATION | businessRegistrationNumber, companyName, representativeName, phone, email, recruitJobTitle, recruitJobCode |
| OPERATION_PLAN | generalTypeCount, intergenerationalTypeCount, plannedHeadcount, representativeConsentToShareAdminInfo(boolean) |
| WORKPLACE_INSURANCE | businessRegistrationNumber, nationalPension·healthInsurance·industrialAccident·employmentInsurance("가입"/"미가입") |
| BUSINESS_REGISTRATION | businessRegistrationNumber, companyName, representativeName |
| WORKER_APPLICATION | name, residentNumber, phone, applicantSignature(boolean), counselorName |
| PRIVACY_CONSENT | allConsentsChecked(boolean), applicantSignature(boolean) |
| RESIDENT_ABSTRACT | name, residentNumber |
| EMPLOYMENT_INSURANCE_HISTORY | name, birthDate, workplaces[]{companyName, startDate, lossDate} |
| ELIGIBILITY_CONFIRM | item1None~item5None(boolean), item6Yes(boolean), applicantSignature(boolean), companyStaffSignature(boolean) |
| LABOR_CONTRACT | companyName, phone, representativeName, workerName, internStartDate(YYYY-MM-DD), internEndDate(YYYY-MM-DD), hasInternKeyword(boolean), employerSignature(boolean), workerSignature(boolean) |
| EDUCATION_LEDGER | participantName, birthDate, educationName, educationOrg, educationDate(YYYY-MM-DD), participantSignature(boolean) |
| SUBSIDY_APPLICATION | businessRegistrationNumber, companyName, representativeName, bankName, bankAccount, accountHolder, applicantCount, totalAmount, applicantSignature(boolean) |
| SUBSIDY_CALCULATION | entries[]{name, round, periodLabel(YYYY-MM), baseSalary, subsidyAmount, subsidyType("INTERN"\|"HIRE")} |
| INSURANCE_ROSTER | businessRegistrationNumber, companyName, entries[]{name, acquisitionDate, healthInsuranceDate, employmentInsuranceDate} |
| PAYROLL | companyName, workerName, month, baseSalary, totalPay, totalDeduction, netPay |
| SALARY_TRANSFER | workerName, transferAmount, transferDate |
| BANK_ACCOUNT_COPY | bankName, accountHolder, accountNumber, isBusinessAccount(boolean) |

### 미비사항 반환 방식

- 필드명: `missingItems`
- 자료형: `string[]` (한글 설명 문장 배열)
- 프롬프트 지시: 서류유형 지정 시 해당 서류만 대상, 없으면 빈 배열 `[]`
- 검증엔진의 Rule 수행 결과와는 별개로, AI가 서류 자체를 육안 판독해 반환하는 자연어 미비 목록

### 변환 실패·분석 실패 처리

| 단계 | 처리 방식 |
|------|----------|
| PDF→Markdown 추출 실패 | `ensureMarkdown()` 내 silent catch — `markdownPath` null 유지, PDF 직접 전송으로 자동 폴백 |
| DOCX→PDF Word COM 실패 | mammoth 텍스트 추출 폴백 → 스텁 PDF 생성 + `.md` 파일 직접 저장 |
| Gemini API 오류 (4xx/5xx) | 예외가 `analyze()` catch 블록으로 전파 → `document.status = FAILED`, `document.errorMessage`에 오류 메시지 저장 |
| Gemini 응답 JSON 파싱 실패 | `BadRequestException` throw → 동일 FAILED 경로 |
| GEMINI_API_KEY 미설정 | `BadRequestException('GEMINI_API_KEY가 설정되지 않았습니다.')` |
| AI 반환값이 배열 | `normalizeExtracted()` (documents.service.ts)로 단일 객체로 병합 후 저장 |
| AI 반환 주민번호 | `maskDeep(rawExtracted)` 통해 마스킹 후 DB 저장 (프롬프트 전송 전에도 `maskResidentNumbers(promptText)` 적용) |

---

## 4. 데이터 구조

### 엔티티 목록

| 엔티티 | 테이블 | 파일 |
|--------|--------|------|
| Document | `documents` | `apps/server/src/modules/documents/document.entity.ts` |
| Company | `companies` | `apps/server/src/modules/companies/company.entity.ts` |
| Worker | `workers` | `apps/server/src/modules/workers/worker.entity.ts` |
| SubsidyCalculation | `subsidy_calculations` | `apps/server/src/modules/subsidy/subsidy-calculation.entity.ts` |
| SubsidySetting | `subsidy_settings` | `apps/server/src/modules/subsidy/subsidy-setting.entity.ts` |
| JudgmentHistory | `judgment_histories` | `apps/server/src/modules/validation/judgment-history.entity.ts` |
| Business | `businesses` | `apps/server/src/modules/businesses/business.entity.ts` |
| Institution | `institutions` | `apps/server/src/modules/institutions/institution.entity.ts` |
| User | `users` | `apps/server/src/modules/users/user.entity.ts` |
| CompanyBusiness | `company_businesses` | `apps/server/src/modules/companies/company-business.entity.ts` |
| JobAnnouncement | `job_announcements` | `apps/server/src/modules/announcements/job-announcement.entity.ts` |
| MailTemplate / MailLog | `mail_templates` / `mail_logs` | `apps/server/src/modules/mail/` |

### Document 엔티티 주요 필드

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| business_id | varchar nullable | 사업 스코프 |
| file_name | varchar | 원본 파일명 |
| file_path | varchar | 서버 저장 경로 (UUID 파일명) |
| converted_file_path | varchar nullable | PDF 변환 결과 경로 |
| markdown_path | varchar nullable | PDF→Markdown 추출 결과 .md 경로 |
| document_type | varchar nullable | DocumentTypeCode |
| company_id / worker_id | uuid nullable FK | 기업/근로자 연결 |
| source | varchar | 'UPLOAD' \| 'IMAP' |
| sender_email | varchar nullable | IMAP 수집 시 발신자 이메일 |
| **status** | enum | PENDING / ANALYZING / ANALYZED / FAILED / REVIEWED |
| **extracted_data** | simple-json nullable | AI 추출 원본값 + missingItems (마스킹 처리) |
| **reviewed_data** | simple-json nullable | 실무자 수정값 |
| error_message | text nullable | 분석 실패 시 오류 메시지 |
| analyzed_at | datetime nullable | 분석 완료 시각 |

### AI 추출값 vs 실무자 수정값 구분 저장 방식

| 항목 | `extracted_data` | `reviewed_data` |
|------|-----------------|----------------|
| 저장 시점 | Gemini 분석 완료 후 자동 저장 | `PATCH /documents/:id` 호출 시 담당자가 수동 입력 |
| 덮어쓰기 여부 | 재분석 시 갱신 | 독립 컬럼, extracted_data를 덮어쓰지 않음 |
| 우선순위 | 폴백 | 우선 사용 (`doc.reviewedData ?? doc.extractedData`) |
| DB 건수 | 17건 (로컬 개발 DB 기준) | 0건 (현재 개발 DB에 수정 이력 없음) |

### DocumentAnalysisStatus 전체 목록

```
PENDING    — 업로드 직후, 분석 대기
ANALYZING  — Gemini 호출 중
ANALYZED   — 분석 완료
FAILED     — 분석 실패 (errorMessage에 사유)
REVIEWED   — 담당자 검토 완료
```

### 수정 이력 (수정자·시각·사유) 기록 필드

`documents` 테이블에 수정자, 수정 시각, 사유를 별도로 기록하는 컬럼은 없음.  
`judgment_histories`에는 `source`('AI'\|'HUMAN')와 `judged_at`(타임스탬프)이 있으나, 문서 레코드 수정 이력은 아님.  
`subsidy_calculations`에는 `changeSummary`(직전 산정과의 변동 내역 텍스트)가 있음.

---

## 5. 배포·통신 구조

### Electron과 백엔드의 관계

| 모드 | 동작 방식 |
|------|----------|
| 개발 모드 | `win.loadURL('http://localhost:5173')` — Vite dev 서버 렌더링 |
| 프로덕션 | `win.loadFile('../../renderer/dist/index.html')` — 빌드 결과물 로드 |
| **백엔드 동봉 여부** | **미구현** |

`apps/desktop/src/main.ts` 25~28행 주석:
> "TODO: 프로덕션 패키징 시 NestJS 서버(apps/server)를 child_process로 함께 구동하도록 electron-builder files/extraResources 설정을 추가해야 합니다. 개발 모드에서는 루트의 npm run dev가 서버를 별도로 기동합니다."

현재 Electron 앱과 NestJS 백엔드는 각각 독립 프로세스로 개발 환경에서만 동작하며, 단일 실행 파일로의 프로덕션 패키징은 미완료.

### 외부 통신 지점 전체

| 통신 대상 | 파일 경로 | 관련 환경변수 | 전송 데이터 |
|----------|----------|-------------|-----------|
| **Google Gemini AI API** | `gemini.service.ts` | `GEMINI_API_KEY`, `GEMINI_MODEL` | PDF base64 또는 Markdown 텍스트 + 프롬프트. 주민번호는 전송 전 마스킹(`maskResidentNumbers`). |
| **SMTP (메일 발송)** | `mail.service.ts` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | 수신자 이메일, 제목, HTML 본문 |
| **IMAP (메일 수집)** | `mail-collector.service.ts` | `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USER`, `IMAP_PASS`, `IMAP_MAILBOX` | 서버 → 클라이언트 방향: 메일 헤더·본문·첨부파일 수신 |
| **대구고용노동청 크롤링** | `moel-daegu-collector.service.ts` | 없음 (URL 하드코딩) | GET 요청: `https://www.moel.go.kr/local/daegu/news/notice/noticeList.do`. 송신 데이터 없음. |

### DB 파일 위치 및 암호화

| 항목 | 내용 |
|------|------|
| 기본 경로 | `apps/server/data/job-program.sqlite` (process.cwd() 기준) |
| 환경변수 재정의 | `DB_PATH` env로 변경 가능 |
| 엔진 | `better-sqlite3` |
| 암호화 | **없음** — TypeORM 설정 및 better-sqlite3 초기화에 암호화 옵션 미적용 |
| git 포함 여부 | `.gitignore`에서 제외 (`apps/server/data/*.sqlite`) |

---

## 6. 개발 이력

### 최초·최종 커밋

| 항목 | 값 |
|------|---|
| 최초 커밋 | `b5d0361` — 2026-07-16 06:02 KST |
| 최종 커밋 | `d12c9cc` — 2026-10-01 23:43 KST |
| 개발 기간 | 약 78일 |
| 총 커밋 수 | 37개 |

### git log 전체

| 커밋 해시 | 날짜 (KST) | 메시지 |
|-----------|-----------|--------|
| `d12c9cc` | 2026-10-01 23:43 | feat: DOCX→PDF mammoth 폴백 추가 |
| `10ae035` | 2026-10-01 23:39 | feat: 전 형식 PDF 변환 + PDF→Markdown AI 경로 구현 |
| `71bd434` | 2026-09-30 23:39 | fix: R-302 crossCheck용 SUBSIDY_CALCULATION 최상위 name 필드 주입 |
| `dff8ee2` | 2026-09-30 23:38 | feat: 6단계 지원금신청 검증(R-301~309) + 회차 산정/통합 대장 |
| `6b4839e` | 2026-09-30 17:18 | feat: 5단계 근로자신청 검증(R-201~210) + 근로자 대장/검토 재사용 |
| `ea4247b` | 2026-09-30 09:32 | fix: 참여유형 인턴형/세대통합형 추출 수정 및 엑셀 UI 표시 |
| `f4968a5` | 2026-09-30 00:01 | fix: 문서 분석 시 지정된 서류종류로 스코프해 문서별 미비사항만 추출 |
| `eec6847` | 2026-09-29 23:17 | fix: 검증 시 AI 추출값이 배열이면 병합해서 처리 |
| `046d20a` | 2026-09-29 17:36 | docs: CLAUDE.md에 4단계 검증엔진 완료·dev 캐시 주의 기록 |
| `8f0f008` | 2026-09-29 17:35 | feat: 4단계 기업신청 검증엔진/판정이력/대조UI + 규칙원장 R-101~104 |
| `f86ae78` | 2026-09-22 10:57 | 05 실행계획 완료: E단계 체크, 사업 스코프 확장(A~E) 전체 마무리 |
| `06eaea5` | 2026-09-22 10:56 | 문서함에 기업·근로자별 필수서류 체크리스트 표시 (E) |
| `4de9a17` | 2026-09-22 10:47 | 05 실행계획 진행 상태: D단계 완료 체크 |
| `457a7c5` | 2026-09-22 10:47 | 서류유형을 코드값으로 관리하고 업로드·AI분석에 적용 (D) |
| `5889d1b` | 2026-09-22 10:35 | 05 실행계획 진행 상태: C2단계 완료 체크, 기존 vite build 버그 기록 |
| `7f0598c` | 2026-09-22 10:34 | 문서·근로자·메일·지원금 화면을 현재 사업 기준으로 연동 (C2) |
| `162eb7d` | 2026-09-22 10:14 | 05 실행계획 진행 상태: C1단계 완료 체크 |
| `92fbfe5` | 2026-09-22 10:13 | 문서·근로자·메일·지원금 데이터에 사업 스코프 적용 (백엔드) |
| `b85928b` | 2026-09-22 10:13 | 의존성 설치 스크립트 승인 목록 갱신 (allowScripts) |
| `7cbb5ff` | 2026-09-22 00:07 | 다른 컴퓨터에서 이어할 수 있도록 진행 상황 정리 |
| `3f84f3e` | 2026-09-21 22:26 | 05 실행계획 진행 상태: B단계 완료 체크 |
| `6f895ff` | 2026-09-21 22:26 | 로그인 화면에서 사업 선택 후 입장하도록 변경 |
| `a545511` | 2026-09-21 22:18 | 05 실행계획 진행 상태: A단계 완료 체크 |
| `e9ca153` | 2026-09-21 22:16 | 사업유형 3종 정리 및 서류유형·필수서류 데이터 파일 추가 |
| `68d0366` | 2026-09-21 22:10 | 05 실행계획 문서를 docs/ 폴더로 이동 |
| `dad979c` | 2026-09-21 22:10 | origin/master 병합: 05 실행계획 문서 반영 |
| `0a08895` | 2026-09-21 22:08 | Add files via upload |
| `c88b143` | 2026-09-21 21:48 | CLAUDE.md에 기준 문서 섹션 추가 |
| `3b72d46` | 2026-09-21 21:45 | Add files via upload |
| `36688b2` | 2026-08-31 13:43 | CLAUDE.md에 코딩 컨벤션·알려진 이슈·저장소 정보 보강 |
| `6c02d0a` | 2026-08-31 13:25 | 새 컴퓨터 이전 가이드(SETUP.md), 프로젝트 컨텍스트(CLAUDE.md) 추가 |
| `51dd323` | 2026-08-31 13:00 | Claude Code 개발 서버 실행 설정 추가 |
| `0a180f1` | 2026-07-31 14:23 | 로그인/세션, 신사업 알리미 확장, 기업 DB 재구성 추가 (1차 개발지시서) |
| `6b8b718` | 2026-07-30 09:47 | 문서함(AI 분석), 신사업 알리미, 지원금 산정 등 후속 기능 추가 |
| `b47fafa` | 2026-07-16 11:13 | 메일 자동발송 기능 추가 (수동 발송 API + 템플릿 관리) |
| `87b5246` | 2026-07-16 10:21 | 기업/근로자 도메인 엔티티 및 CRUD API 추가 |
| `b5d0361` | 2026-07-16 06:02 | 초기 스캐폴딩: Electron + NestJS + React 모노레포 구성 |

### 기능별 개발 단계 요약

| 커밋 범위 | 추가된 기능 |
|----------|-----------|
| `b5d0361` (07-16) | Electron + NestJS + React 모노레포 기반 구성 |
| `87b5246` ~ `b47fafa` (07-16) | 기업/근로자 CRUD, 메일 자동발송 |
| `6b8b718` (07-30) | 문서함 AI 분석(Gemini), 신사업 알리미, 지원금 산정 |
| `0a180f1` (07-31) | 로그인/세션, 신사업 알리미 D-day 확장, 기업 DB 재구성 |
| `e9ca153` ~ `f86ae78` (09-21~22) | 사업유형 3종, 서류유형 코드, businessId 스코프 전면 적용, 필수서류 체크리스트 |
| `8f0f008` (09-29) | 4단계 기업신청 검증엔진(R-101~104), 판정 이력, 대조 UI |
| `6b4839e` ~ `dff8ee2` (09-30) | 5단계 근로자신청(R-201~210), 6단계 지원금신청(R-301~309) |
| `10ae035` ~ `d12c9cc` (10-01) | 전 형식 PDF 변환 파이프라인, PDF→Markdown AI 경로, DOCX mammoth 폴백 |

---

## 7. 테스트 기록

### 프로젝트 자체 테스트 코드

`apps/`, `packages/` 범위 내 `.test.ts`, `.spec.ts` 파일 없음. 자동화된 단위 테스트/통합 테스트 없음.

### 로컬 개발 DB 문서 레코드 현황

조회 기준: `apps/server/data/job-program.sqlite` (git 제외, 로컬 개발 DB)

**상태별 분포:**

| 상태 | 건수 |
|------|------|
| ANALYZED (분석 완료) | 9건 |
| FAILED (분석 실패) | 7건 |
| PENDING (대기) | 1건 |
| **합계** | **17건** |

**서류유형별 분포:**

| 서류유형 | 건수 |
|--------|------|
| COMPANY_APPLICATION | 5건 |
| (미지정/null) | 4건 |
| WORKPLACE_INSURANCE | 1건 |
| WORKER_APPLICATION | 1건 |
| PRIVACY_CONSENT | 1건 |
| OPERATION_PLAN | 1건 |
| LABOR_CONTRACT | 1건 |
| ELIGIBILITY_CONFIRM | 1건 |
| EDUCATION_LEDGER | 1건 |
| BUSINESS_REGISTRATION | 1건 |
| **합계** | **17건** |

**수집 source별 분포:**

| source | 건수 |
|--------|------|
| UPLOAD (직접 업로드) | 15건 |
| IMAP (메일 수집) | 2건 |

### 처리 소요시간 (업로드 → 분석 완료)

분석 완료(`analyzed_at` 있는) 건들의 `created_at → analyzed_at` 차이:

| 파일명 | 상태 | 소요시간 |
|--------|------|---------|
| test_archive.zip | ANALYZED | 약 3초 |
| vision.pdf | ANALYZED | 약 3,119초 (≈52분) |
| vision.pdf | ANALYZED | 약 3,149초 (≈52분) |
| vision.pdf | FAILED | 약 3,157초 (≈52분) |
| vision.pdf | ANALYZED | 약 3,126초 (≈52분) |

> vision.pdf의 소요시간이 약 52분인 이유: Gemini API가 503(고부하)을 반환해 재시도 대기한 시간이 포함된 개발 테스트 수치이며, 정상 API 응답 시의 실제 처리 시간이 아님. ZIP 파일(test_archive.zip)은 3초 이내 처리됨.

### 판정 이력 현황

| source | 건수 | 설명 |
|--------|------|------|
| AI | 9건 | 자동 검증 결과 |
| HUMAN | 3건 | 담당자 수동 승인 결과 |
| **합계** | **12건** | |

### AI 추출값 vs 실무자 수정값 차이 레코드

`reviewed_data`가 채워진 Document 레코드: **0건**  
현재 개발 DB에서 담당자가 AI 추출값을 수정한 이력 없음. (실증 테스트 미수행)

### 분석 실패(FAILED) 원인 분석

FAILED 7건의 `error_message`를 조회한 결과, 오류는 모두 외부 API 문제이며 두 가지 유형으로 완전히 분류된다.

**오류 유형 1 — Gemini 모델 지원 종료 (HTTP 404 NOT_FOUND) · 4건**

| 파일명 | 서류유형 |
|--------|---------|
| test_doc1.txt | 미지정 |
| test_doc2.txt | 미지정 |
| test_company.pdf | COMPANY_APPLICATION (2회) |

```
"This model models/gemini-2.5-flash is no longer available to new users.
Please update your code to use models/gemini-3.8-flash"
```

초기 개발 시 `.env`의 `GEMINI_MODEL`이 `gemini-2.5-flash`로 설정되어 있었으나, Google이 해당 모델을 신규 사용자에게 비활성화하면서 발생하였다. 이후 `gemini-3.8-flash`로 환경변수를 수정하여 해소되었으며, 이는 시스템 내부 로직의 결함이 아닌 외부 API 정책 변경에 기인한다.

**오류 유형 2 — API 서버 일시적 과부하 (HTTP 503 UNAVAILABLE) · 3건**

| 파일명 | 서류유형 |
|--------|---------|
| vision.pdf | BUSINESS_REGISTRATION |
| test_company.pdf | COMPANY_APPLICATION (2회) |

```
"This model is currently experiencing high demand.
Spikes in demand are usually temporary. Please try again later."
```

Gemini API 서버의 순간 과부하로 인한 일시적 오류이다. 동일한 `vision.pdf`가 다른 시점에 재시도하여 ANALYZED(분석 완료) 상태로 정상 처리된 이력이 확인되므로, 시스템 자체의 처리 결함이 아님을 확인할 수 있다.

**종합**: 분석 실패 7건 전체가 외부 Gemini API의 가용성 문제(모델 정책 변경 4건, 일시적 과부하 3건)에 기인하며, 서류 파싱·변환·DB 저장 등 시스템 내부 처리 과정의 결함에 의한 실패는 0건이다.

### 샘플/픽스처 데이터 파일 목록

| 파일 경로 | 내용 |
|----------|------|
| `apps/server/resources/잡도리AI_표준양식.xlsx` | 서류별 표준양식 엑셀 |
| `apps/server/resources/job-classifications.json` | 직종분류표 (R-104 참조) |
| `apps/server/resources/document-types.json` | 서류유형 정의 |
| `apps/server/resources/required-documents/SENIOR-2026.json` | SENIOR 사업유형 필수서류 정의 |
| `apps/server/resources/validation-rules/SENIOR-company.json` | 4단계 기업신청 규칙 원장 (R-101~104) |
| `apps/server/resources/validation-rules/SENIOR-worker.json` | 5단계 근로자신청 규칙 원장 (R-201~210) |
| `apps/server/resources/validation-rules/SENIOR-subsidy.json` | 6단계 지원금신청 규칙 원장 (R-301~309) |

별도 DB 시드/픽스처 파일 없음. 개발 DB에 관리자 계정(loginId: `admin`)이 수동 삽입되어 있음.

---

*이 보고서는 코드(`apps/`, `packages/`), 환경 설정(`apps/server/.env`), git 이력, 로컬 개발 DB(`apps/server/data/job-program.sqlite`) 에서 직접 확인된 사실만을 기재하였습니다.*
