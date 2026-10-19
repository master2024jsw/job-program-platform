# 파일 구조 재편 구현 결과 보고서

작성일: 2026-10-03

---

## 1. 구현 결과

### 수정·생성된 파일

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `apps/server/resources/document-folder-mapping.json` | documentType → 단계 폴더·파일명 매핑 + 지원금유형 한글 레이블. JSON만 수정하면 서류 추가·변경 반영 | 신규 |
| `apps/server/src/modules/documents/document-path.util.ts` | 순수 함수 3개: `sanitizeName`(Windows 금지 문자·길이 제한), `resolveFolder`(경로 계산), `resolveConflict`(충돌 처리). 외부 의존 없음 | 신규 |
| `apps/server/src/modules/documents/file-router.service.ts` | NestJS 서비스. DB에서 사업·기업·근로자 조회 → `resolveFolder` 호출 → 파일 이동(rename) → DB 경로 갱신 | 신규 |
| `apps/server/src/modules/documents/gemini.service.ts` | `SUBSIDY_CALCULATION` 스키마에 `"LONGTERM"(장기취업유지지원금)` 추가, 프롬프트 반영 | 수정 |
| `apps/server/src/modules/mail-collector/mail-collector.service.ts` | 저장 경로 `uploads/` → `_inbox/`, 파일명 `{UUID}` → `{YYYYMMDD_HHmmss}_{4hex}.{ext}` | 수정 |
| `apps/server/src/modules/documents/documents.controller.ts` | multer destination → `_inbox/`, 파일명 타임스탬프 형식 | 수정 |
| `apps/server/src/modules/documents/documents.service.ts` | `FileRouterService` 주입. `analyze()` 내 ANALYZED 확정 직후 `fileRouterService.relocate(saved)` 호출 (실패해도 ANALYZED 상태 유지) | 수정 |
| `apps/server/src/modules/documents/documents.module.ts` | `FileRouterService` providers에 등록 | 수정 |

### 지시서 9절 구현 순서

| 순서 | 항목 | 상태 |
|---|---|---|
| 1 | 경로 계산 유틸 함수 (`document-path.util.ts`) | 완료 |
| 2 | 매핑 JSON (`document-folder-mapping.json`) | 완료 |
| 3 | LONGTERM 추가 + 프롬프트 수정 | 완료 |
| 4 | 수집 시 `_inbox/` 저장 (메일·직접업로드) | 완료 |
| 5 | 분석 완료 후 파일 이동 + DB 경로 갱신 (`file-router.service.ts`) | 완료 |
| 6 | 안전 처리·충돌 처리 (`sanitizeName`, `resolveConflict` 내장) | 완료 |

---

## 2. 지시서 10절 확인 항목

### ① LONGTERM + R-303 동작

`domain-validation.engine.ts` 451~453행:

```typescript
const typeStr = String(entry[rule.typeField ?? 'subsidyType'] ?? '').toLowerCase();
const isHire = typeStr.includes('채용') || typeStr === 'hire';
const maxAmt = isHire ? hireMax : internMax;  // internMax = 400,000원
```

`'longterm'`은 `'채용'`을 포함하지 않고 `'hire'`도 아니므로 **`internMax = 400,000원` 기준으로 계산**됩니다.

- 오류: 없음
- 건너뜀: 없음
- 결과: **인턴 공식(min(급여×50%, 400,000원))으로 잘못 계산**

실제 장기취업유지 지원금 단가가 다를 경우 선언 금액과 차이가 나서 NEEDS_REVIEW 판정이 발생할 수 있습니다.  
산정 로직 수정은 후속 작업으로 남겨뒀습니다.

---

### ② 최신 파일 판별 방법

`documents.created_at`은 파일 저장 시 INSERT되며 갱신되지 않습니다(TypeORM `@CreateDateColumn`). 충돌 발생 시 재제출 파일은 별도 Document 레코드로 생성되므로 **`created_at DESC` 정렬이 가장 최근 파일을 가리킵니다.**

새 컬럼 추가는 불필요합니다. 동일 기업·근로자·documentType의 Documents를 `created_at DESC`로 조회하면 최신 파일을 식별할 수 있습니다.

---

### ③ `_미분류/` → 정상 경로 재배치 기능

필요합니다. `FileRouterService.relocate(document)` 자체는 이미 재호출 가능한 public 메서드로 구현되어 있습니다. 담당자가 UI에서 `companyId`를 수동으로 지정하면, 해당 Document를 대상으로 `POST /documents/:id/relocate` 같은 별도 API를 만들어 `relocate()`를 다시 호출하면 됩니다.

이번 구현 범위에는 API·UI가 포함되지 않았으나, 서비스 메서드는 재사용 가능한 형태로 분리돼 있습니다.

---

### ④ 경로 길이 위험 사례

실제 테스트 결과 케이스별 전체 경로 길이 (cwd ≈ 60자 기준):

| 케이스 | 경로 길이 |
|---|---|
| `01_기업신청\01_기업신청서.pdf` | 117자 |
| `02_근로자신청\정세원_900115\01_참여신청서.pdf` | 129자 |
| `03_지원금신청\정세원_장기취업유지지원금\02_산출내역.pdf` | 131자 |
| `_미분류\20261003_unknown@mail.com\첨부파일.pdf` | 101자 |

Windows 260자 제한에 여유가 있습니다. `sanitizeName`이 이름을 30자로 자르고, 240자 초과 시 서비스 로그에 경고를 남깁니다.

가장 긴 조합 예상치: `cwd(60) + 사업명(30) + 기업명_사번(30) + 단계(15) + 근로자명_유형(30) + 파일명(20)` ≈ 185자 — 안전합니다.

---

## 3. 동작 확인

경로 계산 유틸을 5개 케이스로 직접 실행한 결과입니다.

### 케이스 1 — 기업신청서 (COMPANY_APPLICATION, IMAP)

```
입력:
  businessName  = "2026-경기지역주도형청년일자리"
  companyName   = "가나다산업"
  companyBrn    = "123-45-67890"
  documentType  = "COMPANY_APPLICATION"
  originalFile  = "기업신청서.hwp"

결과:
  dir       : data\2026-경기지역주도형청년일자리\가나다산업_1234567890\01_기업신청
  baseName  : 01_기업신청서
  finalPath : data\...\01_기업신청\01_기업신청서.pdf          (117자)
  originalDir: data\...\01_기업신청\_원본                    ← HWP 원본 보관
```

### 케이스 2 — 참여신청서 (WORKER_APPLICATION, 직접업로드)

```
입력:
  documentType  = "WORKER_APPLICATION"
  workerName    = "정세원"
  workerBirthDate = "1990-01-15"

결과:
  dir       : ...\02_근로자신청\정세원_900115
  baseName  : 01_참여신청서
  finalPath : ...\02_근로자신청\정세원_900115\01_참여신청서.pdf   (129자)
```

### 케이스 3 — 산출내역 LONGTERM (SUBSIDY_CALCULATION)

```
입력:
  documentType  = "SUBSIDY_CALCULATION"
  workerName    = "정세원"
  subsidyType   = "LONGTERM"

결과:
  dir       : ...\03_지원금신청\정세원_장기취업유지지원금
  baseName  : 02_산출내역
  finalPath : ...\03_지원금신청\정세원_장기취업유지지원금\02_산출내역.pdf   (131자)
```

### 케이스 4 — 기업 식별 실패 → `_미분류/`

```
입력:
  companyName = null
  senderEmail = "unknown@mail.com"

결과:
  dir       : data\_미분류\20261003_unknown@mail.com
  finalPath : data\_미분류\20261003_unknown@mail.com\첨부파일.pdf   (101자)
```

### 케이스 5 — 임금명세서, subsidyType 없음 + 기존 인턴 폴더 1개

```
입력:
  documentType             = "PAYROLL"
  subsidyType              = null
  existingSubsidyFolderNames = ["정세원_인턴지원금"]   ← 기존 폴더 1개

결과:
  dir       : ...\03_지원금신청\정세원_인턴지원금          ← 기존 폴더 폴백 정상 동작
  baseName  : 04_임금명세서
```

### sanitizeName 검증

| 입력 | 출력 |
|---|---|
| `가나다산업` | `가나다산업` |
| `가나다:산업/주식회사` | `가나다_산업_주식회사` |
| `경기지역주도형청년일자리사업참여기업가나다산업` (23자) | 그대로 (30자 미만) |
| `""` (빈 문자열) | `_미상` |
| `"   "` (공백만) | `_미상` |
| `"...파일..."` (앞뒤 마침표) | `파일` |

### `_inbox/` 임시 저장 → 이동 흐름

코드 레벨 검증은 완료됐으나, 실제 파일 업로드 E2E 테스트는 수행하지 않았습니다.  
**서버를 재시작해야 변경된 코드가 적용됩니다.**

```bash
# 현재 서버 종료 후
npm run dev:server -w apps/server
```

TypeScript 컴파일(`tsc -b --noEmit`) 오류: **없음**

---

## 4. 지시서와 다르게 구현한 부분

| 항목 | 지시서 | 실제 구현 | 이유 |
|---|---|---|---|
| `_미분류/` 재배치 API | 명시 없음 | 서비스 메서드만 구현, 엔드포인트 없음 | 지시서 구현 범위 외. `relocate()`는 이미 public으로 분리되어 있어 API 추가 시 한 줄이면 됨 |
| 사업 이름 없는 경우 | `_사업미지정` 사용 | `businessId` 있지만 DB 조회 실패 시에도 `_사업미지정` 사용 | `BusinessesService.findOne`이 `NotFoundException`을 던지므로 try/catch로 잡아 `null` 처리 후 폴백 |
| 매핑 파일 경로 | 언급 없음 | `process.cwd()/resources/document-folder-mapping.json` | 서버 기동 시 `process.cwd()`가 `apps/server/`이며 기존 코드도 같은 패턴 사용 |

---

## 5. 아직 처리되지 않은 예외 상황

| 항목 | 내용 |
|---|---|
| **서버 재시작 필요** | 현재 실행 중인 서버는 변경 전 코드일 수 있음. `npm run dev:server` 재시작 후 적용 |
| **R-303 LONGTERM 산정 오류** | LONGTERM은 인턴 공식(400,000원 상한)으로 계산됨. 실제 지원단가가 다르면 NEEDS_REVIEW 발생. 산정 로직 수정은 후속 작업 |
| **`_미분류/` 재배치 UI** | `relocate()` 메서드는 구현됐지만, 담당자가 `companyId` 지정 후 재배치하는 API·UI 엔드포인트는 없음 |
| **기존 `uploads/` 파일 재분석 시 이동** | 기존 파일에 대해 재분석을 실행하면 `relocate()`가 호출되어 `uploads/`에서 구조화 경로로 이동함. 마이그레이션 안 하기로 결정했으나 재분석 요청 시에는 이동이 일어날 수 있음. 의도 확인 필요 |
| **ZIP 내부 파일** | `analyzeZip()` → 각 자식 `analyze()` → `relocate()` 순서로 자동 처리되도록 설계됨. 실제 ZIP 파일로는 테스트하지 않음 |

---

*이 보고서는 코드 레벨 검증 및 경로 계산 유틸 직접 실행 결과를 기반으로 작성되었습니다.*
