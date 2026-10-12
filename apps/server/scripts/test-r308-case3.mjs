/**
 * R-308 케이스3: 통장 예금주 = 개인명의 (법인명의 불일치 → R-308c NEEDS_REVIEW)
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/job-program.sqlite');
const db = new Database(dbPath);

const COMPANY_ID = '24dd0d0b-8fe4-4fc5-ac85-b60574fabef1';
const BIZ_ID = 'BIZ-2026-SENIOR';

// 기존 테스트 row 정리 후 케이스3 삽입
db.prepare("DELETE FROM documents WHERE id LIKE 'test-r308%'").run();

const insert = db.prepare(`
  INSERT INTO documents (id, business_id, company_id, worker_id, document_type, file_name, file_path, mime_type, file_size, extracted_data, reviewed_data, status, created_at, updated_at)
  VALUES (?, ?, ?, NULL, ?, ?, ?, 'application/pdf', 1, ?, NULL, 'ANALYZED', datetime('now'), datetime('now'))
`);

// 통장사본: 개인명의 (대표자 김동휴)
insert.run(
  'test-r308-bank',
  BIZ_ID, COMPANY_ID,
  'BANK_ACCOUNT_COPY', 'bank.pdf', 'data/uploads/test-bank.pdf',
  JSON.stringify({ bankName: '국민은행', accountHolder: '김동휴', accountNumber: '123-456-789012', isBusinessAccount: false })
);

// 지급신청서: 예금주 = 기업명 (통장 예금주와 불일치)
insert.run(
  'test-r308-app',
  BIZ_ID, COMPANY_ID,
  'SUBSIDY_APPLICATION', 'app.pdf', 'data/uploads/test-app.pdf',
  JSON.stringify({
    businessRegistrationNumber: '514-81-31753',
    companyName: '비젼투어(주)',
    representativeName: '김동휴',
    bankName: '국민은행',
    bankAccount: '123-456-789012',
    accountHolder: '비젼투어(주)',
    applicantCount: 1,
    totalAmount: 400000,
    applicantSignature: true
  })
);

console.log('케이스3(개인명의) 삽입 완료');
db.close();
