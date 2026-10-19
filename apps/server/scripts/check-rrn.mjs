import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database('C:/Users/innod/projects/job-program-platform/apps/server/data/job-program.sqlite', { readonly: true });

// 비젼투어 근로자 목록
const workers = db.prepare(
  "SELECT id, name, birth_date, gender FROM workers WHERE company_id = '24dd0d0b-8fe4-4fc5-ac85-b60574fabef1'"
).all();
console.log('근로자:', JSON.stringify(workers, null, 2));

// maskRrnForLedger 로직 (수정 후 버전: *****)
function maskRrnForLedger(worker) {
  if (!worker.birth_date) return '';
  const ymd = worker.birth_date.replace(/-/g, '').slice(2);
  const gDigit = worker.gender === 'MALE' ? '1' : worker.gender === 'FEMALE' ? '2' : '';
  return `${ymd}-${gDigit}******`;
}

console.log('\n엑셀 G열 출력값 (수정 후):');
workers.forEach(w => {
  console.log(`  ${w.name}: "${maskRrnForLedger(w)}"`);
});

// DB extracted_data의 residentNumber 형식 확인
const docs = db.prepare(
  "SELECT document_type, extracted_data FROM documents WHERE company_id = '24dd0d0b-8fe4-4fc5-ac85-b60574fabef1' AND document_type IN ('RESIDENT_ABSTRACT','WORKER_APPLICATION') AND status = 'ANALYZED'"
).all();
console.log('\nDB extracted_data.residentNumber:');
docs.forEach(d => {
  const data = JSON.parse(d.extracted_data || '{}');
  if (data.residentNumber) {
    console.log(`  ${d.document_type}: "${data.residentNumber}"`);
  }
});

// maskResidentNumbers 로직 (수정 후 버전)
const RRN_PATTERN = /(\d{6})[-\s]?([1-4]\d{6})/g;
function maskResidentNumbers(text) {
  return text.replace(RRN_PATTERN, (_m, front, back) => `${front}-${back[0]}******`);
}
console.log('\nmaskResidentNumbers 테스트:');
console.log('  "911128-1234567" →', maskResidentNumbers('911128-1234567'));
console.log('  "911128 1234567" →', maskResidentNumbers('911128 1234567'));
console.log('  "911128-1******" →', maskResidentNumbers('911128-1******')); // 이미 마스킹 → 그대로

db.close();
