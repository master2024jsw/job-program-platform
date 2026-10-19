/**
 * 기존 자료를 통일된 단계(company_businesses.stage)로 옮긴다.
 *
 * 옮기는 근거 (가장 높은 것 하나를 고른다 — 추측하지 않는다):
 *   participantApplied = Y            -> 근로자신청접수
 *   agreementConcluded = Y            -> 협약체결
 *   agreementSentDate 있음            -> 협약진행
 *   recruitStatus = VERIFIED          -> 기업검증완료
 *   recruitStatus = APPLIED/CONTACTED -> 기업서류요청
 *   그 외                             -> 모집대상
 *
 * 근로자검증완료는 **자동으로 올리지 않는다.** 근로자 판정이력이 있어도
 * 그것이 '승인'인지 '위험신호'인지 구분이 필요해서, 담당자가 직접 확인하고 올리도록 둔다.
 * (설계서 §18.2 — 매핑 근거 없는 자동 배정 금지)
 *
 * 사용법:
 *   node apps/server/scripts/migrate-stages.mjs           (미리보기, 쓰지 않음)
 *   node apps/server/scripts/migrate-stages.mjs --apply   (실제 반영)
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

const LABEL = {
  PROSPECT: '모집대상',
  DOCS_REQUESTED: '기업서류요청',
  COMPANY_VERIFIED: '기업검증완료',
  AGREEMENT_SENT: '협약진행',
  AGREEMENT_SIGNED: '협약체결',
  WORKER_APPLIED: '근로자신청접수',
  WORKER_VERIFIED: '근로자검증완료',
};

const dbPath = path.join(dataDir(), 'job-program.sqlite');
console.log('');
console.log('DB   : ' + dbPath);
console.log('모드 : ' + (APPLY ? '실제 반영 (--apply)' : '미리보기 (쓰지 않음)'));
console.log('');

const db = new Database(dbPath, { readonly: !APPLY });

const hasCol = (table, col) => db.prepare(`PRAGMA table_info("${table}")`).all().some((r) => r.name === col);

if (!hasCol('company_businesses', 'stage')) {
  console.log('company_businesses.stage 컬럼이 없습니다. 서버를 한 번 띄운 뒤 다시 실행하세요.');
  db.close();
  process.exitCode = 1;
} else {
  const rows = db
    .prepare(
      `SELECT cb.*, c.name AS company_name, c.recruit_status
       FROM company_businesses cb
       JOIN companies c ON c.id = cb.company_id`,
    )
    .all();

  const plan = [];
  for (const cb of rows) {
    let target = 'PROSPECT';
    let why = '진행 근거 없음';

    const rs = cb.recruit_status ?? 'PROSPECT';
    if (rs === 'CONTACTED' || rs === 'APPLIED') {
      target = 'DOCS_REQUESTED';
      why = `모집단계 ${rs}`;
    }
    if (rs === 'VERIFIED') {
      target = 'COMPANY_VERIFIED';
      why = '모집단계 VERIFIED (기업 검증 완료)';
    }
    if (cb.agreement_sent_date) {
      target = 'AGREEMENT_SENT';
      why = `협약 발송일 ${cb.agreement_sent_date}`;
    }
    if (cb.agreement_concluded) {
      target = 'AGREEMENT_SIGNED';
      why = '협약체결 Y';
    }
    if (cb.participant_applied) {
      target = 'WORKER_APPLIED';
      why = '참여자신청 Y';
    }

    const current = cb.stage ?? 'PROSPECT';
    plan.push({
      id: cb.id,
      company: cb.company_name,
      from: current,
      to: target,
      why,
      changed: current !== target,
    });
  }

  for (const p of plan) {
    const mark = p.changed ? '변경' : '유지';
    console.log(`  [${mark}] ${p.company} : ${LABEL[p.from]} -> ${LABEL[p.to]}  (${p.why})`);
  }
  const changes = plan.filter((p) => p.changed);
  console.log('');
  console.log(`사업참여 ${plan.length}건 중 변경 ${changes.length} / 유지 ${plan.length - changes.length}`);

  if (APPLY && changes.length) {
    const upd = db.prepare('UPDATE company_businesses SET stage = ? WHERE id = ?');
    const log = db.prepare(
      `INSERT INTO company_stage_changes
       (id, business_id, company_id, company_business_id, from_stage, to_stage, source, reason, changed_at)
       SELECT ?, business_id, company_id, id, ?, ?, 'AUTO', ?, datetime('now')
       FROM company_businesses WHERE id = ?`,
    );
    // 관리대장(공문 양식) 불리언도 단계에 맞춘다.
    // documentGuideSent 는 '참여자 서류 안내'라 협약체결(AGREEMENT_SIGNED)부터 켠다.
    const ORDER = {
      PROSPECT: 0, DOCS_REQUESTED: 1, COMPANY_VERIFIED: 2,
      AGREEMENT_SENT: 3, AGREEMENT_SIGNED: 4, WORKER_APPLIED: 5, WORKER_VERIFIED: 6,
    };
    const flags = db.prepare(
      `UPDATE company_businesses
       SET document_guide_sent = ?, agreement_concluded = ?, business_plan_registered = ?, participant_applied = ?
       WHERE id = ?`,
    );
    const tx = db.transaction((items) => {
      for (const p of items) {
        upd.run(p.to, p.id);
        log.run(randomUUID(), p.from, p.to, `기존 자료 이관: ${p.why}`, p.id);
        const at = (s) => (ORDER[p.to] >= ORDER[s] ? 1 : 0);
        flags.run(at('AGREEMENT_SIGNED'), at('AGREEMENT_SIGNED'), at('AGREEMENT_SIGNED'), at('WORKER_APPLIED'), p.id);
      }
    });
    tx(changes);
    console.log('');
    console.log(`반영 완료 — ${changes.length}건. 변경 이력도 함께 기록했습니다.`);
    console.log('근로자검증완료는 자동으로 올리지 않았습니다. 화면에서 직접 확인 후 올려주세요.');
  } else if (!APPLY) {
    console.log('');
    console.log('미리보기였습니다. 실제로 반영하려면 --apply 를 붙이세요.');
  }
  db.close();
}
