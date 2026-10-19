# 잡도리 AI v2 — ERD와 주석형 데이터 사전

상태: 신규 설계 제안. **운영 DB에 그대로 실행하는 마이그레이션 스크립트가 아닙니다.**

관계 그림: `diagrams/domain.mmd` 
처리 흐름: `diagrams/processing.mmd`

> ERD는 ‘데이터 장부끼리 어떻게 연결되는가’를 보여주는 그림입니다. Mermaid를 지원하는 Markdown 미리보기에서 그림으로 볼 수 있습니다. 렌더링 도구가 없어도 아래 표와 관계 설명만으로 내용을 이해할 수 있습니다.

## 1. 공통 표기

| 표기 | 뜻 | 쉬운 설명 |
| --- | --- | --- |
| PK | 기본키 | 해당 행의 고유 번호 |
| FK | 외래키 | 다른 장부의 행을 가리키는 번호 |
| UNIQUE | 중복 금지 | 같은 참여·같은 요청이 중복 저장되지 않게 함 |
| NOT NULL | 필수 값 | 반드시 입력해야 함 |
| nullable | 비어 있을 수 있음 | 0이나 미확정 값으로 억지로 채우지 않음 |
| CHECK | 데이터 조건 | 종료일이 시작일보다 빠르지 않다는 등의 검사 |
| snapshot | 당시 값의 사본 | 원장이 나중에 바뀌어도 당시 판정 근거는 남음 |
| revision | 내용 변경 번호 | 새 자료가 반영될 때마다 증가 |
| version | 동시 수정 검사 번호 | 이전 화면으로 덮어쓰기 하지 못하게 함 |

신규 ID는 UUID 계열 문자열로 생성합니다. 기존 Business·Worker·Company ID는 바꾸지 않습니다. 날짜는 업무 날짜 `YYYY-MM-DD`와 발생시각 UTC를 구분하며, 화면의 기본 업무 시간대는 `Asia/Seoul`로 제안합니다. 실제 다른 시간대 운영은 별도 결정입니다.

원화 금액은 정수, 비율은 정밀 계산용 값으로 관리합니다. 알 수 없는 금액은 null입니다. 신규 테이블의 주요 관계에는 실제 FK와 인덱스를 적용합니다. 마이그레이션 과정의 미배정 자료만 예외적으로 nullable 상태를 허용합니다.

## 2. 기존 테이블의 유지·변경

| 테이블/객체 | 이번 처리 | 주석 |
| --- | --- | --- |
| Institution / User / UserBusiness | 유지·권한 보강 | 세션과 담당 사업 배정의 기반 |
| Business | 기존 ID 유지, 사업별 정책 연결 강화 | BIZ 형식 ID를 일괄 UUID로 변환하지 않음 |
| Company | 기존 원장 유지 + institutionId 보강 | 기관 소유 원장. 사업자번호 고유 제약도 기관 범위와 정합성을 확인 |
| CompanyBusiness | 유지, 식별·접근 검증의 기준으로 사용 | 회사와 사업의 결합 [J05](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/companies/company-business.entity.ts) |
| Worker | 기존 ID 유지 + institutionId 보강, 사람 정보 중심으로 점진 전환 | 회사·급여·계약의 새 기준은 Participation [J09](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/workers/worker.entity.ts) |
| Document | 논리 서류 원장으로 확장 | 실제 바이트·버전·추출실행을 분리 [J11](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/documents/document.entity.ts) |
| SubsidySetting | 사업별 행으로 전환 | 안내 시점 설정과 공식 지급산정 정책은 분리 [J17](https://github.com/master2024jsw/job-program-platform/blob/d9dc635a04ff5c76a8ef544547935a79b6ec770c/apps/server/src/modules/subsidy/subsidy.service.ts) |
| SubsidyCalculation | 기존 기록 보존 + Claim 연결 | 레거시 계산을 지침 검증 완료로 바꾸지 않음 |
| MailTemplate / MailLog | 유지 + 사업·Case 연결 | 발송 당시 수신자/본문/첨부 스냅샷과 결과 기록 |

아래 필드명은 TypeScript 표기입니다. DB에서는 기존 관례에 맞게 snake_case를 사용합니다.

## 3. Participation — 사람의 사업 참여기록

| 필드 | 타입·제약 | 쉬운 주석 |
| --- | --- | --- |
| id | UUID, PK | 참여 이력 한 건의 번호 |
| institutionId | FK, 필수 | 이 기록을 소유한 운영기관 |
| businessId | FK, 필수 | 어느 연도·사업 참여인지 |
| companyBusinessId | FK, 필수 | 해당 사업의 어느 참여기업인지 |
| workerId | FK, 필수 | 기존 사람 원장 번호 |
| episodeNo | 양의 정수, 필수 | 동일 사업에서 별도 참여 이력을 구분. 재참여 자격을 허용한다는 뜻은 아님 |
| participationType | 코드, nullable | 사업별 참여유형. 지침 확인값만 사용 |
| startDate / endDate | 날짜, nullable | 사업상 참여기간 |
| hireDate / resignDate | 날짜, nullable | 고용 관계가 있는 사업의 입·퇴사일 |
| contractType | 코드, nullable | 기존 계약형태를 보존·변환 |
| monthlySalaryWon | 정수, nullable | 해당 참여기록에 적용되는 급여 |
| status | 코드, 필수 | APPLIED / ACTIVE / EXITED / COMPLETED / CANCELLED |
| version | 정수, 필수 | 동시 수정 방지 |
| createdAt / updatedAt | 시각, 필수 | 생성·최근 변경 시각 |
| archivedAt | 시각, nullable | 삭제 대신 보관 처리 |

제약: `UNIQUE(businessId, workerId, episodeNo)`. 같은 Worker가 여러 사업·연도에 참여할 수 있습니다. CompanyBusiness와 Participation의 기관·사업은 일치해야 합니다. 종료일이 시작일보다 빠르면 거절합니다.

**고용조건 변경:** 급여가 변경되면 진행 중인 관련 심사의 입력이 달라졌는지 검사하고 재검토를 표시합니다. 이미 확정한 심사는 과거 스냅샷을 보존합니다. 다구간 계약·다기업 이동 이력의 별도 정규화는 후속 확장입니다. 변경 사실을 메모만 바꾸어 덮어쓰지는 않습니다.

## 4. WorkCase — 심사해야 하는 신청 한 건

| 필드 | 타입·제약 | 쉬운 주석 |
| --- | --- | --- |
| id | UUID, PK | 심사 건 번호 |
| institutionId / businessId | FK, 필수 | 기관·사업 경계 |
| kind | 코드, 필수 | COMPANY_ELIGIBILITY / PARTICIPANT_ELIGIBILITY / SUBSIDY_VERIFICATION |
| companyBusinessId | FK, 필수 | 어느 기업의 신청인지 |
| participationId | FK, 조건부 필수 | 참여자·지원금 심사에는 필요, 기업 심사에는 비어 있음 |
| title | 문자열, 필수 | 사용자에게 보여줄 건명 |
| status | 코드, 필수 | INTAKE / READY / REVIEW_REQUIRED / SUPPLEMENT_REQUIRED / HELD / APPROVED / REJECTED / CANCELLED |
| policyVersionId | FK, nullable | 적용할 지침. 접수 단계에는 비어 있을 수 있으나 검증·승인 전에는 필수 |
| referenceDate | 날짜, nullable | 규칙이 필요로 하는 업무 기준일. 무조건 오늘이 아님 |
| assignedUserId | FK, nullable | 담당자 |
| dataRevision | 정수, 필수 | 선택 서류·확정값·정책이 달라질 때 증가 |
| version | 정수, 필수 | 상태 변경까지 포함한 동시 수정 검사 |
| latestValidationRunId | FK, nullable | 최신 결과를 빨리 찾기 위한 참조. 입력 일치 검사 없이 믿지 않음 |
| currentDecisionId | FK, nullable | 현재 유효한 사람 결정 참조 |
| openedAt / closedAt | 시각 / nullable | 접수·종결 시각 |

Case와 Participation·CompanyBusiness의 관계 일치는 서버에서 검사하고 가능한 부분은 복합 FK로 보강합니다. 기업 심사의 participationId는 NULL, 나머지는 NOT NULL이라는 조건은 CHECK 또는 동일한 강도의 저장 경로 검증으로 구현합니다. 쓰기 경로별 통합 테스트가 필수입니다.

## 5. FileAsset / Document / DocumentVersion — 파일, 서류, 판본

### FileAsset: 실제 파일 바이트

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / institutionId | PK / 필수 FK | 파일 번호와 기관 소유권 |
| storageKey | 상대 저장키, 필수 | DATA_DIR 아래 서버가 생성한 경로. 사용자 파일명을 경로로 쓰지 않음 |
| sha256 | 문자열, 필수 | 파일 바이트의 식별 해시 |
| byteSize / mimeType | 크기 / 형식, 필수 | 업로드의 실제 형식·용량 검사 |
| kind | ORIGINAL / NORMALIZED / SCOPED / REDACTED | 원본·PDF 변환본·허용 페이지 추출본·전송용 비식별본 |
| sourceAssetId | 자기 FK, nullable | 어느 원본에서 파생됐는지 |
| createdAt | 시각, 필수 | 보관 시작 시각 |

같은 파일의 물리적 저장을 재사용할 수 있지만, 업무 접수기록까지 합치지 않습니다. 파일 해시는 외부 공개 식별자로 사용하지 않습니다.

### Document: 논리적인 한 종류의 서류 원장

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id | 기존 ID 유지 | 기존 문서 링크를 깨지 않음 |
| institutionId | 필수 FK | 미분류 문서도 기관 소유자는 있어야 함 |
| businessId | nullable FK | 미분류 접수 때만 비어 있을 수 있음 |
| companyBusinessId / participationId | nullable FK | 아직 대상이 확정되지 않았을 수 있음 |
| assignmentStatus | UNASSIGNED / ASSIGNED | 사업·대상이 확인됐는지 |
| displayName | 문자열 | 서류의 표시 이름 |
| archivedAt | nullable 시각 | 보관 상태 |

기존 `filePath`, `convertedFilePath`, `extractedData`, `reviewedData`는 이관 중 호환용으로 보존합니다. v2의 판정은 다음 버전/실행 테이블만 기준으로 합니다. 단일 원장을 서로 다른 사업의 자료로 덮어 바꾸지 않습니다.

### DocumentVersion: 분류와 내용이 고정된 판본

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / documentId | PK / 필수 FK | 서류의 특정 판본 |
| versionNo | 양의 정수 | 1판·2판 등 |
| documentTypeCode | 필수 코드 | 분류 미확정은 OTHER/UNCLASSIFIED, 임의 문장 사용 금지 |
| originalAssetId | 필수 FK | 최초 제출된 원본 |
| normalizedAssetId | nullable FK | 내부 PDF 변환본 |
| scopedAssetId | nullable FK | 실제 열람·추출을 허용한 페이지 부분 파일 |
| redactedAssetId | nullable FK | 외부 전송을 승인한 경우의 전송본 |
| pageStart / pageEnd | 양의 정수 또는 미확정 | 한 묶음 파일의 어느 부분인지 |
| sourceAttachmentId | nullable FK | 어느 이메일 첨부에서 왔는지 |
| supersedesVersionId | nullable FK | 이전 판본 번호 |
| createdBy / createdAt | 사용자 FK / 시각 | 판본 등록자와 등록 시각 |

제약: `UNIQUE(documentId, versionNo)`. 승인에 사용한 판본을 수정하지 않습니다. 분류·페이지범위를 바꾸면 새 판본으로 취급합니다. 아직 처리 중인 판본의 파생 파일 FK는 입력 해시를 검증한 작업자가 미등록→등록 방향으로 한 번 채울 수 있습니다. 완료된 변환·추출에서 사용한 바이트와 참조는 고정하며, 다른 바이트의 변환 결과로 교체하려면 새 판본/실행을 만듭니다.

**중요한 권한 주석:** 여러 사람의 서류가 합쳐진 ORIGINAL 파일을 공유할 때, 한 사람의 Case 접근권한만으로 전체 원본 다운로드를 허용하지 않습니다. 일반 검토자는 허용된 페이지의 SCOPED 파일을 봅니다. 전체 접수 묶음 원본은 전체 자료 접근권한 또는 별도 접수관리 권한을 검사합니다.

## 6. CaseDocument — 심사에 실제로 채택한 서류

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / caseId | PK / 필수 FK | 심사-서류 연결 번호 |
| documentVersionId | 필수 FK | 사용한 정확한 판본 |
| requirementKey | 필수 문자열 | PAYSLIP/해당월 등 정책상 증빙 자리. 단순 파일종류와 구분 |
| selectedExtractionRunId | nullable FK | 이번 심사에 채택한 추출 실행 |
| active | boolean | 현재 증빙인지, 교체된 과거 증빙인지 |
| attachedBy / attachedAt | 사용자 / 시각 | 누가 이 서류를 연결했는지 |

제약: 같은 Case·판본·requirementKey 중복 방지. 서류 타입별로 여러 달이 필요할 수 있으므로 단순 `UNIQUE(caseId, documentType)`로 제한하지 않습니다. 실제 선택 개수는 정책의 요구조건으로 검사합니다. CaseDocument는 Case와 동일 기관·사업의 DocumentVersion만 연결합니다. 다른 사업에서 동일 원본을 재사용하려면 별도 권한으로 그 사업의 논리 Document를 만들고 재사용 출처를 기록합니다. 파일 바이트 재사용과 타 사업 자료 접근권은 별개입니다. 연결 추가·교체·활성변경·추출실행 채택 시 Case.dataRevision이 증가합니다.

## 7. ExtractionRun / FieldCorrection — 읽은 값과 사람 보정

### ExtractionRun

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / documentVersionId | PK / 필수 FK | 서류 판독 1회 |
| jobId | nullable FK | 백그라운드 처리 연결 |
| provider / model | 문자열 | 어떤 추출기를 사용했는지. 수동·가짜 테스트 Adapter도 구분 |
| schemaVersion / promptVersion | 문자열 | 추출 구조·지시문의 버전 |
| inputAssetId / inputHash | FK / 해시 | 실제 분석한 파일과 바이트 식별 |
| executionStatus | QUEUED / RUNNING / SUCCEEDED / FAILED | 기술 처리 상태 |
| resultJson | nullable JSON | 타입·근거가 포함된 추출값. 성공 때만 판정 입력으로 사용 |
| errorCode | nullable 문자열 | 안전한 오류 식별자 |
| startedAt / finishedAt | nullable 시각 | 시작·완료 시점 |

완료된 실행의 resultJson은 불변입니다. 다시 분석하면 새 Run을 만듭니다. API 제공자 응답 원문을 장기간 저장할 필요가 있다면 별도 제한 보관정책을 정하며, 로그에 전문을 출력하지 않습니다.

### FieldCorrection

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / caseId / extractionRunId | PK / 필수 FK | 어느 심사에서 어느 판독을 확인했는지 |
| fieldPath | 문자열 | 보정한 항목의 정확한 이름 |
| action | CONFIRM / CORRECT | 맞다고 확인했는지, 다른 값으로 고쳤는지 |
| originalValue / newValue | 타입 있는 JSON 값 | 전후 비교 |
| reason | 문자열 | 수정 이유. 확인 동작은 정책에 따른 사유 |
| actorUserId / createdAt | 사용자 / 시각 | 확인자와 확인 시각 |
| caseDataRevision | 정수 | 보정 후 심사 입력 번호 |

보정은 Case 범위로 적용합니다. 한 심사에서 수정한 값이 다른 사업·과거 심사의 원본 데이터를 자동 변경하지 않습니다. 원장으로 반영하는 기능은 별도 명시적 명령과 검증을 거치며 첫 버전에서 자동화하지 않습니다.

## 8. PolicyVersion — 지침과 규칙의 발행본

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / institutionId | PK / 필수 FK | 정책 번호·관리기관 |
| businessTypeCode / guidelineYear | 코드 / 정수 | 어떤 사업유형·연도인지 |
| version | 문자열 | 같은 연도의 개정본도 구분 |
| status | DRAFT / PUBLISHED / RETIRED | 초안·발행·새 적용 중지 |
| isDemo | boolean | 예시 정책이면 운영 발행 차단 |
| effectiveFrom / effectiveUntil | 날짜 / nullable | 적용시점. 기준일 선택 규칙과 함께 해석 |
| sourceReferencesJson | JSON | 원문 문서·조항·쪽수·회신·확인자 |
| requirementsJson | JSON | 단계·유형·대상·기간별 필수서류 |
| ruleDefinitionsJson | JSON | 네 유형의 규칙 정의 |
| extractionSchemaRefsJson | JSON | 사용할 서류별 추출 스키마 버전 |
| contentHash | 문자열 | 규칙 묶음의 내용 식별 |
| publishedBy / publishedAt | nullable 사용자 / 시각 | 발행 승인 기록 |

제약: `UNIQUE(institutionId, businessTypeCode, guidelineYear, version)`. 발행 후 본문 변경 불가. 같은 선택 조건에 여러 발행본이 겹쳐 모호해지면 정책 발행을 거절하거나 선택 우선순위를 명시적으로 확정합니다. 오래된 발행본은 신규 적용에서 제외해도 과거 이력 재현용으로 보존합니다.

## 9. ValidationRun / ValidationFinding — 규칙 검증 결과

### ValidationRun

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / caseId / policyVersionId | PK / 필수 FK | 어느 건을 어느 지침으로 검사했는지 |
| caseDataRevision | 정수 | 사용한 입력 번호 |
| inputSnapshotJson | JSON, 필수 | 선택 서류·추출·보정·참여·기준일의 당시 값 |
| inputHash / policyHash | 해시 | 승인 시 결과 재사용 가능 여부 검사 |
| engineVersion | 문자열 | 규칙 실행기 코드 버전 |
| executionStatus | QUEUED / RUNNING / SUCCEEDED / FAILED | 기술 실행상태 |
| overallVerdict | nullable 코드 | PASS / FAIL / NEEDS_REVIEW / INSUFFICIENT_DATA |
| coverageJson | JSON | 필수 규칙 중 실제 평가된 항목 |
| createdBy / createdAt / finishedAt | 사용자 / 시각 | 요청·완료 정보 |

입력 해시는 안정된 정규화와 정렬 규칙으로 계산합니다. JSON 객체 키 순서가 달라졌다는 이유로 내용이 달라진 것으로 보거나, 근거 필드를 빠뜨려 다른 입력을 같다고 보는 일을 방지합니다.

### ValidationFinding

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / validationRunId | PK / 필수 FK | 한 규칙의 결과 |
| ruleKey / ruleVersion | 문자열 | 어떤 규칙인지 |
| category | crossCheck / calcRule / exceptionRule / riskFlag | 논문의 네 분류 |
| verdict | PASS / FAIL / NEEDS_REVIEW / INSUFFICIENT_DATA / NOT_APPLICABLE | 규칙의 업무판정 |
| severity | BLOCK / REVIEW / INFO | 후속 조치 수준 |
| reason | 문자열 | 사람이 읽을 판정 이유 |
| evidenceRefsJson | JSON | 서류판본·쪽수·추출·보정 참조 |
| calculationTraceJson | nullable JSON | 계산식·기준일·중간값·반올림 설명 |

제약: `UNIQUE(validationRunId, ruleKey)` 또는 같은 규칙을 여러 대상에 실행하는 경우 `ruleKey + targetKey`로 확장합니다. 실제 구조를 바꿀 때는 명시적 결정 기록과 테스트를 추가합니다.

## 10. ReviewDecision / Activity — 최종 결정과 업무 기록

### ReviewDecision

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / caseId | PK / 필수 FK | 결정 대상 |
| validationRunId | 조건부 필수 FK | APPROVED/REJECTED에는 완료된 실행 필수. 검증 전 HELD/SUPPLEMENT_REQUIRED에는 nullable |
| decision | APPROVED / REJECTED / SUPPLEMENT_REQUIRED / HELD | 실무자가 내린 결정 |
| caseDataRevision | 필수 정수 | 결정 당시 입력 번호 |
| inputHash / policyHash | 조건부 필수 해시 | 최종 승인·반려에는 필수. 검증 전 보류·보완에는 nullable |
| approvedAmountWon | nullable 정수 | 지원금 승인 건인 경우만 |
| reason | 문자열 | 승인·반려·보완·보류 이유 |
| reviewerUserId / decidedAt | 사용자 / 시각 | 실제 결정자 |
| supersedesDecisionId | nullable FK | 재검토로 대체한 이전 결정 |
| commandId | 필수 고유값 | 승인 요청 중복 방지 |

Case 최신 상태·version·ReviewDecision·Activity는 한 트랜잭션으로 저장합니다. 하나만 저장되는 부분 성공은 허용하지 않습니다. 과거 결정은 UPDATE로 내용을 바꾸지 않습니다. 검증 전 보류·보완을 위해 가짜 ValidationRun을 만들지 않습니다. 최종 승인·반려는 완료된 실제 검증 실행과 일치해야 하며, 검증 전 결정 API로 우회할 수 없습니다.

### Activity

| 필드 | 타입·제약 | 주석 |
| --- | --- | --- |
| id / caseId | PK / 필수 FK | 해당 Case에서 발생한 업무 사실 |
| type | 문자열 코드 | CASE_OPENED / DOCUMENT_ATTACHED / CORRECTED / VALIDATED / DECIDED / MAIL_SENT 등 |
| summary | 문자열 | 사람이 읽는 한 줄 설명 |
| actorUserId | nullable FK | 사용자 또는 시스템 처리 |
| eventKey | 고유 문자열 | 같은 처리 결과의 중복 기록 방지 |
| occurredAt | 시각 | 발생 시각 |
| relatedRecordRefJson | JSON | 관련 문서·판정·발송 기록 참조 |

초기 Activity는 완료된 사실 중심입니다. 예약 Task와 Activity를 무조건 한 테이블로 합치지 않습니다. 감사용 상세 수정정보와 사용자 타임라인은 노출 범위가 다르므로 API에서도 분리합니다.

## 11. SubsidyClaim / SubsidyCalculation / 지급 기록

| 객체 | 주요 필드 | 주석 |
| --- | --- | --- |
| SubsidyClaim | id, businessId, participationId, caseId(UNIQUE), benefitType, periodStart, periodEnd, installmentNo, requestedAmountWon | 기간·회차가 분명한 신청 건 |
| SubsidyCalculation | 기존 필드 보존 + claimId, policyVersionId, inputHash, formulaVersion, amountWon, origin | 계산 시점의 입력과 식. origin은 LEGACY 또는 POLICY |
| 지급 확인 기록(후속) | claimId, 확인자, 지급일, 금액, 외부 처리참조, 정정 연결 | 실제 지급했다는 사실. 이체 API는 포함하지 않음 |

Claim과 WorkCase의 사업·참여기록이 일치해야 합니다. Claim을 만들 때 Case도 함께 생성하고 부분 저장을 막습니다. 지급 여부를 Claim의 검증 결과에서 자동 추론하지 않습니다.

## 12. 처리 인프라 원장

| 객체 | 필드·고유키 | 쉬운 주석 |
| --- | --- | --- |
| Job | id, institutionId, businessId?, type, targetId, targetVersion, idempotencyKey, status, attempts, leaseToken, leaseUntil, nextAttemptAt, safeErrorCode, resultRef | 작업을 다시 시작해도 어디까지 했는지 아는 처리 장부 |
| MailReceipt | accountId, mailbox, uidValidity, uid, messageId?, receivedAt, processingStatus | 메시지 단위 접수. UID만으로는 메일함 변경을 구분하지 못함 |
| AttachmentReceipt | receiptId, partKey, fileAssetId, processingStatus | 메일 하나에 첨부가 여러 개일 때 각각의 성공·실패 추적 |
| CommandReceipt | institutionId, actorId, operation, idempotencyKey, requestHash, responseRef, status | 승인·생성 요청을 중복 실행하지 않게 하는 기술 장부 |
| MigrationMapping | legacyTable, legacyId, targetId, evidence, confirmedBy, status | 과거 자료를 어디에 옮겼는지 남기는 이관 장부 |

Job은 Case가 아직 없는 수집 단계에도 존재할 수 있습니다. businessId가 NULL인 Job은 접수관리 권한으로 제한하고 일반 사업 담당자 전체에게 공개하지 않습니다.

## 13. 관계·제약의 구현 점검표

- Participation의 CompanyBusiness가 가리키는 businessId와 요청 사업이 같아야 합니다.
- WorkCase의 participationId가 있다면 Participation과 companyBusinessId도 같아야 합니다.
- CaseDocument의 DocumentVersion → Document.businessId와 Case.businessId가 같아야 합니다.
- FieldCorrection의 ExtractionRun이 해당 Case에 실제로 연결된 판본에서 나온 결과여야 합니다.
- ValidationRun의 정책 사업유형·효력범위가 Case와 맞아야 합니다.
- ReviewDecision의 Run·입력 번호·해시가 Case의 현재 입력과 같아야 합니다.
- 원본 Asset을 접근할 때는 해당 Case의 허용 페이지 범위까지 확인합니다.
- 보존할 이력에는 무분별한 CASCADE DELETE를 적용하지 않습니다.
- 복합 FK를 쓰면 참조받는 컬럼 묶음에도 대응 UNIQUE 인덱스를 정의합니다.
- nullable FK를 썼다는 이유로 사업 경계 검사를 생략하지 않습니다.

이 체크리스트는 서버 서비스 테스트와 SQLite FK/무결성 검사로 확인합니다. ERD 그림에 선이 있다는 사실만으로 데이터베이스가 관계를 실제 강제한다고 보고하지 않습니다.

## 14. 이관에서 모르는 값을 다루는 방법

| 기존 자료 | 새 구조 처리 | 금지할 처리 |
| --- | --- | --- |
| 사업이 확인된 Worker | 기존 ID를 참조하는 Participation 생성 | 이름·생일만으로 여러 Worker 자동 병합 |
| 사업이 불분명한 Worker | Mapping 상태를 NEEDS_REVIEW로 기록 | 전부 기본 사업으로 배정 |
| 기존 extractedData | 레거시 ExtractionRun으로 보존, 출처 미확인 필드 표시 | 원문 페이지·신뢰도를 임의 생성 |
| 기존 reviewedData | 레거시 검토 스냅샷으로 보존 | 검토자·검토시각을 추측해 공식 승인 생성 |
| periodLabel만 있는 산정 | LEGACY로 보존, 기간·회차 확인 후 연결 | 문자열을 임의 해석해 지급회차 확정 |
| 원본 파일이 없는 문서 | MISSING_ASSET 상태와 복구 필요 표시 | 문서가 있다고 보고서에 정상 출력 |

**주의:** Worker를 Participation과 연결하는 모델은 장기적으로 바른 방향일 수 있어도, 과거 사업 배정 사실을 새 설계가 만들어 낼 수는 없습니다. 모르는 값은 확인 대기 상태로 남깁니다.
