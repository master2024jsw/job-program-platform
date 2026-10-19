/**
 * 기존 workers 행을 participations 로 연결한다 (설계서 §18.2 5단계, §7 '추가' 단계).
 *
 * 원칙:
 *  - workers 행은 지우지도 바꾸지도 않는다. 참여기록을 "추가"만 한다.
 *  - 소속이 불분명한 행(company_id 또는 business_id 없음)은 건너뛰고 보류로 보고한다.
 *    설계서 §18.2 '금지' — 매핑 근거 없는 자동 배정을 하지 않는다.
 *  - 기업참여(company_businesses)가 없으면 만들지 않고 보류한다.
 *  - 이미 참여기록이 있으면 건너뛴다 (다시 실행해도 중복이 안 생긴다).
 *
 * 사용법:
 *   node apps/server/scripts/migrate-workers-to-participations.mjs          (미리보기, 쓰지 않음)
 *   node apps/server/scripts/migrate-workers-to-participations.mjs --apply  (실제 반영)
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const require = createRequire(path.join(process.cwd(), 'apps/server/package.json'));
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');

function dataDir() {
  if (process.env.JOBDORI_DATA_DIR) return path.resolve(process.env.JOBDORI_DATA_DIR);
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, '잡도리AI', 'data');
}
const dbPath = path.join(dataDir(), 'job-program.sqlite');

console.log('');
console.log('DB      : ' + dbPath);
console.log('모드    : ' + (APPLY ? '실제 반영 (--apply)' : '미리보기 (쓰지 않음)'));
console.log('');

const db = new Database(dbPath, { readonly: !APPLY });

const hasTable = (n) =>
  !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(n);

if (!hasTable('participations')) {
  console.log('participations 테이블이 없습니다. 서버를 한 번 띄워 테이블을 만든 뒤 다시 실행하세요.');
  db.close();
  process.exitCode = 1;
} else {
  const workers = db.prepare('SELECT * FROM workers').all();
  const plan = [];

  for (const w of workers) {
    if (!w.business_id) {
      plan.push({ worker: w.name, action: '보류', reason: '사업(business_id)이 비어 있음' });
      continue;
    }
    if (!w.company_id) {
      plan.push({ worker: w.name, action: '보류', reason: '소속 기업(company_id)이 비어 있음' });
      continue;
    }
    const cb = db
      .prepare('SELECT * FROM company_businesses WHERE company_id = ? AND business_id = ?')
      .get(w.company_id, w.business_id);
    if (!cb) {
      plan.push({
        worker: w.name,
        action: '보류',
        reason: '이 기업의 해당 사업 참여기록(company_businesses)이 없음 — 먼저 기업을 사업에 참여시켜야 함',
      });
      continue;
    }
    const dup = db
      .prepare('SELECT id FROM participations WHERE worker_id = ? AND company_business_id = ?')
      .get(w.id, cb.id);
    if (dup) {
      plan.push({ worker: w.name, action: '건너뜀', reason: '참여기록이 이미 있음' });
      continue;
    }
    plan.push({
      worker: w.name,
      action: '추가',
      reason: `사업 ${w.business_id} / 기업참여 ${cb.id.slice(0, 8)}`,
      row: {
        id: randomUUID(),
        business_id: w.business_id,
        company_business_id: cb.id,
        worker_id: w.id,
        participation_type: cb.participation_type ?? null,
        position: w.position ?? null,
        contract_type: w.contract_type ?? null,
        hire_date: w.hire_date ?? null,
        intern_end_date: w.intern_end_date ?? null,
        resign_date: w.resign_date ?? null,
        continuous_hire_date: w.continuous_hire_date ?? null,
        salary: w.salary ?? null,
        status: w.status ?? 'ACTIVE',
        application_status: w.application_status ?? null,
        memo: null,
        migrated_from_worker: 1,
      },
    });
  }

  for (const p of plan) {
    console.log(`  [${p.action}] ${p.worker} — ${p.reason}`);
  }
  const toAdd = plan.filter((p) => p.action === '추가');
  console.log('');
  console.log(`근로자 ${workers.length}명 중 추가 ${toAdd.length} / 건너뜀 ${plan.filter((p) => p.action === '건너뜀').length} / 보류 ${plan.filter((p) => p.action === '보류').length}`);

  if (APPLY && toAdd.length) {
    const cols = Object.keys(toAdd[0].row);
    const stmt = db.prepare(
      `INSERT INTO participations (${cols.map((c) => '"' + c + '"').join(',')}, created_at, updated_at)
       VALUES (${cols.map(() => '?').join(',')}, datetime('now'), datetime('now'))`,
    );
    const tx = db.transaction((rows) => {
      for (const r of rows) stmt.run(cols.map((c) => r[c]));
    });
    tx(toAdd.map((p) => p.row));
    console.log('');
    console.log(`반영 완료 — participations ${toAdd.length}건 추가. workers 는 건드리지 않았습니다.`);
  } else if (!APPLY) {
    console.log('');
    console.log('미리보기였습니다. 실제로 반영하려면 --apply 를 붙이세요.');
  }
  db.close();
}
