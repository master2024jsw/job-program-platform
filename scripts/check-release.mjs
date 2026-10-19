/**
 * 배포 전 안전장치 (CLAUDE.md "개발 진행 규칙" 규칙 2).
 * 개발용 약한 계정·세션키가 남은 상태로 배포본이 나가는 것을 막는다.
 * 개발 중에는 아무 영향이 없고, npm run package / update:local 때만 실행된다.
 *
 * 통과 못하면 exit 1 + 한국어 사유 출력.
 * 의도적으로 무시해야 할 때만: ALLOW_WEAK_RELEASE=1 npm run package
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const require = createRequire(path.join(process.cwd(), 'apps/server/package.json'));
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const WEAK_PASSWORDS = ['adm123', 'usr123', 'admin', '1234', 'admin123', 'password'];
const problems = [];
const notes = [];

// ── 1. SESSION_SECRET ───────────────────────────────────────────
const envPath = path.join(process.cwd(), 'apps/server/.env');
let secret = process.env.SESSION_SECRET ?? '';
if (!secret && fs.existsSync(envPath)) {
  const m = fs.readFileSync(envPath, 'utf8').match(/^\s*SESSION_SECRET\s*=\s*(.*)$/m);
  if (m) secret = m[1].trim().replace(/^["']|["']$/g, '');
}
if (!secret) {
  problems.push([
    'SESSION_SECRET 이 설정되지 않았습니다.',
    `apps/server/.env 에 아래 한 줄을 넣으세요 (아무도 모르는 긴 임의 문자열):`,
    `  SESSION_SECRET=${Buffer.from(os.hostname() + Date.now()).toString('base64url').slice(0, 44)}`,
    '없으면 서버가 개발용 고정키(dev-only-insecure-secret)를 쓰고, 세션을 위조할 수 있습니다.',
  ]);
} else if (secret === 'dev-only-insecure-secret' || secret.length < 16) {
  problems.push([
    'SESSION_SECRET 이 개발용 기본값이거나 너무 짧습니다.',
    '16자 이상의 임의 문자열로 바꾸세요. (apps/server/.env)',
  ]);
} else {
  notes.push('SESSION_SECRET 설정 확인');
}

// ── 2. 배포 대상 DB 의 약한 계정 ─────────────────────────────────
const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData/Roaming');
const candidates = [
  path.join(appData, '잡도리AI/data/job-program.sqlite'),
  path.join(appData, '@job-program/desktop/data/job-program.sqlite'),
  path.join(process.cwd(), 'apps/server/data/job-program.sqlite'),
  path.join(process.cwd(), 'data/job-program.sqlite'),
].filter((p) => fs.existsSync(p));

if (candidates.length === 0) {
  notes.push('검사할 DB 파일이 없습니다 (빈 상태 배포 - 정상)');
} else {
  let bcrypt;
  try {
    bcrypt = require('bcryptjs');
  } catch (e) {
    problems.push([
      `비밀번호 검사 모듈을 불러올 수 없어 안전장치를 확인하지 못했습니다: ${e.message}`,
      'npm install 을 먼저 실행하세요. 확인하지 못한 상태로 배포하지 않습니다.',
    ]);
  }

  for (const p of candidates) {
    if (!bcrypt) break;
    // DB 읽기는 자식 프로세스로 분리한다 (better-sqlite3 + Node 24 네이티브 크래시 격리).
    const r = spawnSync(process.execPath, [path.join('scripts', '_dump-users.mjs'), p], {
      encoding: 'utf8',
      cwd: process.cwd(),
      timeout: 20000,
    });

    let parsed = null;
    if (r.stdout) { try { parsed = JSON.parse(r.stdout.trim()); } catch {} }

    if (!parsed) {
      problems.push([
        `DB 를 읽지 못해 계정 안전성을 확인하지 못했습니다.`,
        `DB: ${p}`,
        r.status === null
          ? `원인: 읽기 프로세스가 비정상 종료했습니다 (signal=${r.signal}). better-sqlite3 와 Node ${process.version} 의 호환 문제일 수 있습니다.`
          : `원인: 종료코드 ${r.status}. ${(r.stderr || '').trim().slice(0, 120)}`,
        '확인하지 못한 상태를 통과로 처리하지 않습니다. (설계서 F04 원칙)',
      ]);
      continue;
    }
    if (!parsed.ok) {
      problems.push([`DB 검사 실패: ${parsed.error}`, `DB: ${p}`]);
      continue;
    }
    if (!parsed.hasUsers) { notes.push(`${p} - users 테이블 없음 (건너뜀)`); continue; }

    const weak = [];
    for (const u of parsed.rows) {
      if (!u.is_active) continue;
      for (const pw of WEAK_PASSWORDS) {
        if (bcrypt.compareSync(pw, u.password_hash)) { weak.push(`${u.login_id} (${u.role})`); break; }
      }
    }
    if (weak.length) {
      problems.push([
        `약한 비밀번호 계정이 남아 있습니다: ${weak.join(', ')}`,
        `DB: ${p}`,
        '해결: 앱에서 해당 계정의 비밀번호를 운영용으로 바꾸거나 계정을 비활성화하세요.',
        '이 DB 의 workers 테이블에는 실제 주민번호가 있을 수 있습니다.',
      ]);
    } else {
      notes.push(`계정 확인 통과 (${parsed.rows.length}명) - ${p}`);
    }
  }
}

// -- 결과 --------------------------------------------------------
// 주의: better-sqlite3 핸들이 열린 상태에서 process.exit() 를 부르면
// node 24 에서 cleanup hook assertion 으로 크래시한다. exitCode 만 설정한다.
console.log('');
console.log('배포 전 안전장치 검사');
for (const n of notes) console.log(green(`  OK  ${n}`));

if (problems.length === 0) {
  console.log('');
  console.log(green('통과 — 배포를 계속합니다.'));
  console.log('');
  process.exitCode = 0;
} else {
  console.log('');
  console.log(red(`배포를 중단했습니다. 해결할 항목 ${problems.length}건:`));
  console.log('');
  problems.forEach((lines, i) => {
    console.log(red(`  [${i + 1}] ${lines[0]}`));
    lines.slice(1).forEach((l) => console.log(`      ${l}`));
    console.log('');
  });

  if (process.env.ALLOW_WEAK_RELEASE === '1') {
    console.log(yellow('ALLOW_WEAK_RELEASE=1 — 경고를 무시하고 계속합니다. 테스트 배포에만 쓰세요.'));
    console.log('');
    process.exitCode = 0;
  } else {
    console.log(yellow('개발 중에는 이 검사가 실행되지 않습니다. 지금은 배포 명령이라서 실행됐습니다.'));
    console.log(yellow('테스트 목적이면 환경변수 ALLOW_WEAK_RELEASE=1 을 붙여 다시 실행하세요.'));
    console.log('');
    process.exitCode = 1;
  }
}
