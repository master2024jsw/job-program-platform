/**
 * R-308 crossCheck 로직을 DB에서 직접 실행해서 결과를 출력합니다.
 * HTTP 서버 없이 동작합니다.
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/job-program.sqlite');
const db = new Database(dbPath, { readonly: true });

const COMPANY_ID = '24dd0d0b-8fe4-4fc5-ac85-b60574fabef1';
const BIZ_ID = 'BIZ-2026-SENIOR';

// 기업 정보 (COMPANY_CONTEXT)
const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(COMPANY_ID);
const COMPANY_CONTEXT = {
  companyName: company?.name ?? '',
  businessRegistrationNumber: company?.business_registration_number ?? '',
};
console.log('COMPANY_CONTEXT:', COMPANY_CONTEXT);

// 해당 기업의 서류 목록
const docs = db.prepare(
  "SELECT document_type, extracted_data, reviewed_data FROM documents WHERE company_id = ? AND business_id = ? AND status = 'ANALYZED'"
).all(COMPANY_ID, BIZ_ID);

const input = { COMPANY_CONTEXT };
for (const d of docs) {
  const data = JSON.parse(d.reviewed_data ?? d.extracted_data ?? '{}');
  if (!input[d.document_type]) input[d.document_type] = data;
}
console.log('\n서류 목록:', Object.keys(input));
if (input.BANK_ACCOUNT_COPY) console.log('BANK_ACCOUNT_COPY:', input.BANK_ACCOUNT_COPY);
if (input.SUBSIDY_APPLICATION) console.log('SUBSIDY_APPLICATION (bank 필드):', {
  bankName: input.SUBSIDY_APPLICATION.bankName,
  bankAccount: input.SUBSIDY_APPLICATION.bankAccount,
  accountHolder: input.SUBSIDY_APPLICATION.accountHolder,
});

// 정규화 함수
function normalizeBrn(raw) {
  if (raw == null) return null;
  return String(raw).replace(/[^0-9]/g, '');
}
function normalizeCompanyName(raw) {
  if (raw == null) return null;
  return String(raw)
    .replace(/\s/g, '')
    .replace(/㈜|㈔|\(주\)|\(사\)|주식회사|유한회사|합자회사|합명회사/gi, '')
    .toLowerCase()
    .trim() || null;
}

// crossCheck 실행
function runCrossCheck(rule, inputData) {
  const { id, label, skipIfMissing, documents, field, fieldMap, normalize, onMismatch } = rule;

  // skipIfMissing 체크
  if (skipIfMissing) {
    for (const docType of skipIfMissing) {
      if (!inputData[docType]) {
        console.log(`\n[${id}] SKIP (통장사본 없음)`);
        return { id, label, status: 'PASS', skipped: true };
      }
    }
  }

  const collected = [];
  for (const doc of documents) {
    const fieldName = (fieldMap?.[doc]) ?? field;
    const data = inputData[doc];
    if (!data) {
      collected.push({ doc, value: null, norm: null });
      continue;
    }
    const raw = data[fieldName] ?? null;
    let norm;
    if (normalize === 'brn') norm = normalizeBrn(raw);
    else if (normalize === 'companyName') norm = normalizeCompanyName(raw);
    else norm = raw == null ? null : String(raw).trim();
    collected.push({ doc, fieldName, value: raw, norm });
  }

  const norms = collected.map(c => c.norm).filter(n => n != null);
  const allEqual = norms.length >= 2 && norms.every(n => n === norms[0]);

  const status = allEqual ? 'PASS' : onMismatch;
  console.log(`\n[${id}] ${label}`);
  collected.forEach(c => console.log(`  ${c.doc}.${c.fieldName} = "${c.value}" → norm: "${c.norm}"`));
  console.log(`  결과: ${status} (allEqual=${allEqual})`);
  return { id, label, status, collected };
}

// R-308 규칙들
const rules = [
  { id: 'R-308', type: 'crossCheck', label: '신청서↔통장 은행명 일치', skipIfMissing: ['BANK_ACCOUNT_COPY'], field: 'bankName', documents: ['BANK_ACCOUNT_COPY', 'SUBSIDY_APPLICATION'], onMismatch: 'NEEDS_REVIEW' },
  { id: 'R-308a', type: 'crossCheck', label: '신청서↔통장 예금주 일치', skipIfMissing: ['BANK_ACCOUNT_COPY'], field: 'accountHolder', documents: ['BANK_ACCOUNT_COPY', 'SUBSIDY_APPLICATION'], onMismatch: 'NEEDS_REVIEW' },
  { id: 'R-308b', type: 'crossCheck', label: '신청서↔통장 계좌번호 일치', skipIfMissing: ['BANK_ACCOUNT_COPY'], field: 'accountNumber', fieldMap: { SUBSIDY_APPLICATION: 'bankAccount' }, documents: ['BANK_ACCOUNT_COPY', 'SUBSIDY_APPLICATION'], onMismatch: 'NEEDS_REVIEW' },
  { id: 'R-308c', type: 'crossCheck', label: '통장 예금주=기업 법인상호', skipIfMissing: ['BANK_ACCOUNT_COPY'], field: 'accountHolder', fieldMap: { COMPANY_CONTEXT: 'companyName' }, documents: ['BANK_ACCOUNT_COPY', 'COMPANY_CONTEXT'], normalize: 'companyName', onMismatch: 'NEEDS_REVIEW' },
];

console.log('\n=== R-308 검증 ===');
const results = rules.map(r => runCrossCheck(r, input));

console.log('\n=== 요약 ===');
results.forEach(r => console.log(`${r.id}: ${r.status}${r.skipped ? ' (SKIP)' : ''}`));

db.close();
