import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/job-program.sqlite');
console.log('DB path:', dbPath);
const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// 기존 테스트 row 정리
db.prepare("DELETE FROM documents WHERE id LIKE 'test-r308%'").run();

const COMPANY_ID = '24dd0d0b-8fe4-4fc5-ac85-b60574fabef1';
const BIZ_ID = 'BIZ-2026-SENIOR';

const insert = db.prepare(`
  INSERT INTO documents (id, business_id, company_id, worker_id, document_type, file_name, file_path, mime_type, file_size, extracted_data, reviewed_data, status, created_at, updated_at)
  VALUES (?, ?, ?, NULL, ?, ?, ?, 'application/pdf', 1, ?, NULL, 'ANALYZED', datetime('now'), datetime('now'))
`);

// 통장사본: 법인명의 (비젼투어(주)), 신청서와 일치
insert.run(
  'test-r308-bank',
  BIZ_ID, COMPANY_ID,
  'BANK_ACCOUNT_COPY', 'bank.pdf', 'data/uploads/test-bank.pdf',
  JSON.stringify({ bankName: '국민은행', accountHolder: '비젼투어(주)', accountNumber: '123-456-789012', isBusinessAccount: true })
);

// 지급신청서: 동일 은행·계좌·예금주
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

console.log('케이스2(법인명의 일치) 삽입 완료');
db.close();
