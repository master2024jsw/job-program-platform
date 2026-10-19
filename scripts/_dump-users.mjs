/**
 * check-release.mjs 전용 보조 스크립트. SQLite 에서 users 행만 읽어 JSON 으로 출력한다.
 * 별도 프로세스로 분리한 이유: better-sqlite3 11.10 + Node 24 조합에서
 * Statement 가 GC 될 때 네이티브 assertion 으로 프로세스가 죽는다(SIGABRT).
 * 부모 프로세스가 같이 죽으면 검사가 '통과'처럼 보이므로 반드시 분리한다.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const file = process.argv[2];
const require = createRequire(path.join(process.cwd(), 'apps/server/package.json'));
try {
  const Database = require('better-sqlite3');
  const db = new Database(file, { readonly: true });
  const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  const rows = hasUsers
    ? db.prepare('SELECT login_id, password_hash, role, is_active FROM users').all()
    : null;
  db.close();
  // 모든 네이티브 핸들을 버린 뒤 출력한다.
  process.stdout.write(JSON.stringify({ ok: true, hasUsers: Boolean(hasUsers), rows }));
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
}
