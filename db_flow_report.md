# 데이터 흐름 조사 보고서

코드에서 확인된 사실만 기재. 조사 기준일: 2026-10-03

---

## 확인 1 — 추출값이 마스터 DB로 반영되는 경로

**AI 분석 즉시 자동 반영: 없음.**

`documents.service.ts`의 `analyze()`는 추출값을 `documents.extracted_data`에만 저장하며,
`companies` 또는 `workers` 테이블을 건드리지 않습니다.

반영이 일어나는 유일한 경로는 **담당자가 수동 승인**할 때입니다.

| 승인 API | 파일:함수 | companies 업데이트 필드 | workers 업데이트 필드 |
|----------|----------|----------------------|---------------------|
| `POST /validation/company/approve` | `validation.service.ts` `approveCompany()` 219~237행 | `name`, `businessRegistrationNumber`, `representativeName`, `phone`, `email` + CompanyBusiness(`participationType`, `plannedHeadcount`, `recruitJobTitle`, `recruitJobCode`, `jobEligibility`) | 없음 |
| `POST /validation/worker/approve` | `worker-validation.service.ts` `approveWorker()` 252~262행 | 없음 | `name`, `birthDate`, `gender`, `phone`, `hireDate`(internStartDate), `internEndDate` |

즉, AI가 추출한 값은 `documents.extracted_data`에 보관되고, 담당자가 검증 화면에서
확인·수정 후 **승인을 눌러야** 비로소 `companies`/`workers` 테이블에 반영됩니다.
자동 동기화는 구현되어 있지 않습니다.

---

## 확인 2 — 기업·근로자 레코드가 생성되는 모든 경로

### companies 테이블 INSERT

| 경로 | 파일:함수 | 호출 엔드포인트 | source 값 |
|------|----------|--------------|----------|
| 수동 입력 | `companies.service.ts` `create()` 123행 | `POST /companies` | `'manual'` |
| 엑셀 업로드 | `companies.service.ts` `importFromExcel()` 313행 | `POST /companies/import` | `'excel'` |

AI 분석, IMAP 수집, 크롤링 등 다른 경로에서 companies에 자동 INSERT하는 코드는 없습니다.

### workers 테이블 INSERT

| 경로 | 파일:함수 | 호출 엔드포인트 | 비고 |
|------|----------|--------------|------|
| 수동 입력 | `workers.service.ts` `create()` 111행 | `POST /workers` | DTO로 직접 생성 |
| 엑셀 업로드 | `workers.service.ts` `importFromExcel()` 248행 | `POST /workers/import` | 소속기업 사업자번호로 companyId 연결 |

마찬가지로 AI 분석이나 메일 수집에서 workers에 자동 INSERT하는 경로는 없습니다.

---

## 확인 3 — COMPANY_CONTEXT와 WORKER_CONTEXT의 데이터 출처

### COMPANY_CONTEXT

5단계(`worker-validation.service.ts` 132~140행)와
6단계(`subsidy-validation.service.ts` 95~105행) 모두 동일한 방식으로 주입합니다.

```
companiesService.findOne(companyId)  →  companies 테이블
```

| COMPANY_CONTEXT 필드 | 읽는 테이블·컬럼 |
|---------------------|----------------|
| `companyName` | `companies.name` |
| `businessRegistrationNumber` | `companies.business_registration_number` |
| `representativeName` | `companies.representative_name` |
| `phone` | `companies.phone` |

### WORKER_CONTEXT

6단계(`subsidy-validation.service.ts` 163~168행)에서만 주입됩니다.
5단계에는 WORKER_CONTEXT 주입이 없습니다.

```
workersService.findAll({ companyId, businessId })  →  workers 테이블
```

| WORKER_CONTEXT 필드 | 읽는 테이블·컬럼 |
|--------------------|----------------|
| `name` | `workers.name` |
| `birthDate` | `workers.birth_date` |
| `jobTitle` | `workers.position` |

---

## 확인 4 — AI 검토 보고서 다운로드의 데이터 출처

파일: `documents.service.ts` `exportReport()` 307~339행

3개 테이블을 조인합니다.

| 테이블 | 용도 |
|--------|------|
| `documents` | 모든 문서 레코드 (기준 테이블) |
| `companies` | companyId로 조인 → 기업명, 사업자등록번호 |
| `workers` | workerId로 조인 → 근로자명 |

### 엑셀 열 구성 (REPORT_COLUMNS)

| 열 헤더 | 데이터 출처 |
|---------|-----------|
| 기업명 | `companies.name` |
| 사업자등록번호 | `companies.business_registration_number` |
| 근로자명 | `workers.name` |
| 문서종류 | `documents.document_type` |
| 파일명 | `documents.file_name` |
| 출처 | `documents.source` ('메일수집'/'직접업로드') |
| 상태 | `documents.status` (한글 변환) |
| 미비여부 | `reviewedData ?? extractedData`의 `missingItems` 배열 길이 > 0 |
| 미비항목 | `missingItems` 배열을 ' / '로 join |
| 추출/검토 결과(JSON) | `reviewedData ?? extractedData` 전체 JSON 문자열 |
| 등록일 | `documents.created_at` |
| 분석일 | `documents.analyzed_at` |

---

## 확인 5 — 표준양식 엑셀(`잡도리AI_표준양식.xlsx`)

**파일 위치:** `apps/server/resources/잡도리AI_표준양식.xlsx`

### 서버가 이 파일을 사용하는 방식

서버가 xlsx 내용을 파싱하거나 읽지 않습니다.
`app.controller.ts` `GET /resources/standard-template`에서 **파일 그대로 다운로드**만 제공합니다.

```typescript
// app.controller.ts 21~24행
const filePath = path.join(process.cwd(), 'resources', '잡도리AI_표준양식.xlsx');
res.download(filePath, '잡도리AI_표준양식.xlsx');
```

### 업로드 파싱의 기대 열 구성 — 코드와의 연결

엑셀 파일을 업로드하면 `importFromExcel()`이 `readExcelRows(buffer, HEADER_TO_KEY, '기업')`으로
**'기업' 시트**를 파싱합니다. `HEADER_TO_KEY`는 `companies.service.ts` 26~40행의
`EXCEL_COLUMNS`에서 자동 생성되며, 표준양식 파일의 헤더와 반드시 일치해야 합니다(25행 주석 명시).

### 기업 시트 기대 열

| 열 헤더 | 매핑 필드 | 저장 테이블·컬럼 |
|---------|---------|----------------|
| 기업명 | `name` | `companies.name` |
| 사업자등록번호 | `businessRegistrationNumber` | `companies.business_registration_number` |
| 대표자명 | `representativeName` | `companies.representative_name` |
| 연락처 | `phone` | `companies.phone` |
| 이메일 | `email` | `companies.email` |
| 팩스 | `fax` | `companies.fax` |
| 참여유형 | `participationType` | `company_businesses.participation_type` |
| 예정인원 | `plannedHeadcount` | `company_businesses.planned_headcount` |
| 협약발송 | `agreementSentDate` | `company_businesses.agreement_sent_date` |
| 협약체결 | `agreementConcluded` | `company_businesses.agreement_concluded` |
| 사업계획등록 | `businessPlanRegistered` | `company_businesses.business_plan_registered` |
| 참여자신청 | `participantApplied` | `company_businesses.participant_applied` |
| 비고 | `memo` | `companies.memo` |

xlsx 파일 자체의 시트 목록은 바이너리 파일이라 코드로 직접 확인하기 어렵습니다.
코드에서 확인되는 것은 '기업' 시트 1개뿐입니다(`readExcelRows`의 세 번째 인자 `'기업'`).
근로자 임포트(`workers.service.ts` `importFromExcel()`)는 시트 이름 인자 없이 호출하므로
첫 번째 시트를 읽습니다.

---

*이 보고서는 코드(`apps/server/src/`)에서 직접 확인된 사실만을 기재하였습니다.*
