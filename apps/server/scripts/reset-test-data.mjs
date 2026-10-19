/**
 * 테스트 자료 초기화 — 업무자료를 비우고 설정·계정은 남긴다.
 *
 * 개발 중 "지우고 처음부터 다시 테스트" 를 한 번에 하기 위한 스크립트다.
 *
 * 비우는 것 (업무자료):
 *   기업, 기업의 사업참여, 근로자, 근로자의 사업참여, 지원금 신청·산정,
 *   서류, 단계 변경 이력, 검증 판정이력, 메일 발송 로그, 공고
 * 남기는 것 (설정·계정):
 *   기관, 사용자, 사용자-사업 배정, 사업, 메일 템플릿, 지원금 설정
 *
 * 안전장치:
 *   - NODE_ENV=production 이면 실행을 거부한다
 *   - 기본은 미리보기다. --apply 를 붙여야 실제로 지운다
 *   - --apply 시 지우기 전에 DB 를 자동 백업한다
 *   - 업로드된 서류 파일은 --files 를 붙였을 때만 지운다
 *
 * 사용법:
 *   npm run reset:test            미리보기 (아무것도 안 지움)
 *   npm run reset:test:apply      실제 초기화 (DB만)
 *   node apps/server/scripts/reset-test-data.mjs --apply --files   서류 파일까지
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.cwd(), 'apps/server/package.json'));
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const WITH_FILES = process.argv.includes('--files');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;


function dataDir() {
  if (process.env.JOBDORI_DATA_DIR) return path.resolve(process.env.JOBDORI_DATA_DIR);
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, '잡도리AI', 'data');
}

/** 지우는 순서가 중요하다 — 외래키로 참조하는 쪽을 먼저 지운다. */
const CLEAR_ORDER = [
  ['subsidy_claims', '지원금 신청'],
  ['subsidy_calculations', '지원금 산정(레거시)'],
  ['participations', '근로자의 사업참여'],
  ['company_stage_changes', '단계 변경 이력'],
  ['judgment_histories', '검증 판정이력'],
  ['documents', '서류'],
  ['mail_logs', '메일 발송 로그'],
  ['job_announcements', '공고'],
  ['company_businesses', '기업의 사업참여'],
  ['workers', '근로자'],
  ['companies', '기업'],
];

const KEEP = [
  ['institutions', '기관'],
  ['users', '사용자 계정'],
  ['user_businesses', '사용자-사업 배정'],
  ['businesses', '사업'],
  ['mail_templates', '메일 템플릿'],
  ['mail_template_attachments', '메일 템플릿 첨부'],
  ['subsidy_settings', '지원금 설정'],
];

function run() {
  const dir = dataDir();
  const dbPath = path.join(dir, 'job-program.sqlite');

  console.log('');
  console.log('DB   : ' + dbPath);
  console.log('모드 : ' + (APPLY ? red('실제 초기화 (--apply)') : '미리보기 (아무것도 안 지움)'));
  console.log('파일 : ' + (WITH_FILES ? '서류 파일도 삭제 (--files)' : 'DB만 (서류 파일은 그대로)'));
  console.log('');

  if (!fs.existsSync(dbPath)) {
    console.log(red('DB 파일이 없습니다.'));
    process.exitCode = 1;
    return;
  }

  const db = new Database(dbPath, { readonly: !APPLY });
  const exists = (t) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const count = (t) => (exists(t) ? db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c : null);

  console.log('비울 것:');
  let total = 0;
  const targets = [];
  for (const [table, label] of CLEAR_ORDER) {
    const n = count(table);
    if (n === null) continue;
    targets.push([table, label, n]);
    total += n;
    console.log(`  ${label.padEnd(22)} ${String(n).padStart(5)} 건`);
  }

  console.log('');
  console.log('남길 것:');
  for (const [table, label] of KEEP) {
    const n = count(table);
    if (n === null) continue;
    console.log(`  ${label.padEnd(22)} ${String(n).padStart(5)} 건`);
  }

  // 서류 파일: DB 파일과 .env 를 뺀 나머지가 서류 보관 폴더다.
  const fileTargets = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((n) => !n.startsWith('job-program.sqlite') && n !== '.env')
    : [];
  if (fileTargets.length) {
    console.log('');
    console.log('서류 폴더/파일:');
    for (const n of fileTargets) {
      console.log(`  ${n}${WITH_FILES ? '' : '   (--files 없이는 그대로 둡니다)'}`);
    }
  }

  if (!APPLY) {
    console.log('');
    console.log(yellow(`총 ${total}건이 지워집니다. 실제로 지우려면 npm run reset:test:apply 를 실행하세요.`));
    db.close();
    return;
  }

  // 백업 먼저
  // 20261016_020211 형태. slice(0,15) 로 자르면 끝에 '.' 이 남아 폴더명이 지저분해진다.
  const iso = new Date().toISOString();
  const stamp = iso.slice(0, 10).replace(/-/g, '') + '_' + iso.slice(11, 19).replace(/:/g, '');
  const backupDir = path.join(path.dirname(path.dirname(dir)), '잡도리AI-reset-backup-' + stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, 'job-program.sqlite');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(dbPath, backupPath);
  console.log('');
  console.log(green('백업 완료: ' + backupPath));

  const tx = db.transaction(() => {
    for (const [table] of targets) db.prepare(`DELETE FROM "${table}"`).run();
  });
  tx();

  console.log(green(`DB 초기화 완료 — ${total}건 삭제.`));

  if (WITH_FILES) {
    let removed = 0;
    for (const n of fileTargets) {
      try {
        fs.rmSync(path.join(dir, n), { recursive: true, force: true });
        removed++;
      } catch (e) {
        console.log(yellow(`  파일 삭제 실패: ${n} — ${e.message}`));
      }
    }
    console.log(green(`서류 폴더 ${removed}개 삭제.`));
  }

  // 남은 건수 확인
  console.log('');
  console.log('초기화 후 상태:');
  for (const [table, label] of [...targets.map(([t, l]) => [t, l]), ...KEEP]) {
    const n = count(table);
    if (n !== null) console.log(`  ${label.padEnd(22)} ${String(n).padStart(5)} 건`);
  }
  db.close();

  console.log('');
  console.log(green('개발용 로그인 계정(admin123 / adm123)은 그대로입니다.'));
  console.log(yellow('서버가 떠 있다면 브라우저를 새로고침하세요.'));
  console.log('되돌리려면: ' + backupPath + ' 를 ' + dbPath + ' 로 복사하세요.');
}

// 실행부는 맨 아래에 둔다 — 위의 const 선언(CLEAR_ORDER 등)이 먼저 평가되어야 한다.
if (process.env.NODE_ENV === 'production') {
  console.log(red('NODE_ENV=production 입니다. 테스트 초기화는 운영 환경에서 실행할 수 없습니다.'));
  process.exitCode = 1;
} else {
  run();
}
