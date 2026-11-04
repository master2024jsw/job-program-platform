/**
 * 실제 컴파일된 DomainValidationEngine 을 더미 입력으로 돌려 검증결과 샘플을 만든다.
 * 개인정보는 전부 가공값(홍길동 / 000000-0000000 형식) 이다.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
const ROOT = 'C:/Users/innod/projects/job-program-platform';
const require = createRequire(path.join(ROOT, 'apps/server/package.json'));
const D = path.join(ROOT, 'apps/server/dist');

const { DomainValidationEngine } = require(path.join(D, 'modules/validation/domain-validation.engine.js'));
const { JobClassificationService } = require(path.join(D, 'modules/validation/job-classification.service.js'));
const { ValidationRulesService } = require(path.join(D, 'modules/validation/validation-rules.service.js'));

const jc = new JobClassificationService();
if (typeof jc.onModuleInit === 'function') await jc.onModuleInit();
const engine = new DomainValidationEngine(jc);
const rules = new ValidationRulesService();
const ledger = rules.getLedger('SENIOR', 'WORKER');

// ── 더미 신청 건 ──────────────────────────────────────────────
// 의도적으로 세 판정이 모두 나오게 구성한다:
//  · R-200  생년월일 1975 → 만 51세 → FAIL(참여자격 미달)
//  · R-201  초본 '홍길동' vs 신청서 '홍길등' → NEEDS_REVIEW(성명 불일치)
//  · 나머지 → PASS
const input = {
  WORKER_CONTEXT: { birthDate: '1975-03-02', name: '홍길동' },
  COMPANY_CONTEXT: { companyName: '가나다컨설팅', phone: '02-000-0000', representativeName: '김대표' },
  WORKER_APPLICATION: {
    name: '홍길등', residentNumber: '750302-1000000', phone: '010-0000-0000',
    applicantSignature: true, counselorName: '이상담',
  },
  RESIDENT_ABSTRACT: { name: '홍길동', residentNumber: '750302-1000000' },
  EMPLOYMENT_INSURANCE_HISTORY: {
    name: '홍길동', birthDate: '1975-03-02',
    workplaces: [{ companyName: '전직장주식회사', startDate: '2020-01-02', lossDate: '2026-01-31' }],
  },
  PRIVACY_CONSENT: { name: '홍길동', allConsentsChecked: true, applicantSignature: true },
  ELIGIBILITY_CONFIRM: {
    name: '홍길동', item1None: true, item2None: true, item3None: true,
    item4None: true, item5None: true, item6Yes: true,
    applicantSignature: true, companyStaffSignature: true,
  },
  LABOR_CONTRACT: {
    companyName: '가나다컨설팅', representativeName: '김대표', workerName: '홍길동',
    internStartDate: '2026-05-01', internEndDate: '2026-06-30',
    hasInternKeyword: true, baseSalary: 2600000, payUnit: '월',
    employerSignature: true, workerSignature: true,
  },
  EDUCATION_LEDGER: {
    participantName: '홍길동', educationName: '참여자 사전교육',
    educationDate: '2026-05-04', participantSignature: true,
  },
};

// worker-validation.service 가 엔진 호출 전에 하는 필드 정규화를 동일하게 적용한다.
// (성명 필드명이 서류마다 달라서 — name / workerName / participantName / applicantName)
for (const code of Object.keys(input)) {
  const d = input[code];
  const nm = d.name ?? d.workerName ?? d.participantName ?? d.applicantName;
  const rrn = d.residentNumber ?? d.residentRegistrationNumber;
  input[code] = {
    ...d,
    ...(nm != null && d.name == null ? { name: nm } : {}),
    ...(rrn != null && d.residentNumber == null ? { residentNumber: rrn } : {}),
  };
}

const results = engine.validateWithLedger(ledger, input);
const counts = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
const status = results.some((r) => r.verdict === 'FAIL') ? 'RISK'
             : results.some((r) => r.verdict === 'NEEDS_REVIEW') ? 'NEEDS_REVIEW' : 'COMPLETE';

console.log(JSON.stringify({ status, summary: counts, rules: results }, null, 2));
