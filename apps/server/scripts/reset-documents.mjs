#!/usr/bin/env node
/**
 * 테스트 데이터 초기화 스크립트
 *
 * 삭제 대상:
 *   - data/uploads/  안의 모든 파일
 *   - data/_inbox/   안의 모든 파일 (존재할 경우)
 *   - documents      테이블 전체 레코드
 *   - judgment_histories 테이블 전체 레코드
 *
 * 유지 대상: companies, workers, businesses, users 등 마스터 데이터
 *
 * 사용법:
 *   node apps/server/scripts/reset-documents.mjs
 *   node apps/server/scripts/reset-documents.mjs --dry-run
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 스크립트 위치 기준으로 서버 루트 결정
const SERVER_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(SERVER_ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const INBOX_DIR = path.join(DATA_DIR, '_inbox');
const DB_PATH = path.join(DATA_DIR, 'job-program.sqlite');

const isDryRun = process.argv.includes('--dry-run');

// better-sqlite3는 루트 node_modules에 있음
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// ── 파일 목록 수집 ──────────────────────────────────────────

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => path.join(dir, f))
    .filter(f => fs.statSync(f).isFile());
}

// ── DB 카운트 ────────────────────────────────────────────────

function getDbCounts() {
  if (!fs.existsSync(DB_PATH)) {
    return { documents: 0, judgmentHistories: 0 };
  }
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const documents = db.prepare('SELECT COUNT(*) as n FROM documents').get().n;
    const judgmentHistories = db.prepare('SELECT COUNT(*) as n FROM judgment_histories').get().n;
    return { documents, judgmentHistories };
  } finally {
    db.close();
  }
}

// ── 실제 삭제 ────────────────────────────────────────────────

function deleteFiles(files) {
  let deleted = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(f);
      deleted++;
    } catch (err) {
      console.error(`  파일 삭제 실패: ${f} — ${err.message}`);
    }
  }
  return deleted;
}

function deleteDbRecords() {
  if (!fs.existsSync(DB_PATH)) return { documents: 0, judgmentHistories: 0 };
  const db = new Database(DB_PATH);
  try {
    const docResult = db.prepare('DELETE FROM documents').run();
    const jhResult = db.prepare('DELETE FROM judgment_histories').run();
    return { documents: docResult.changes, judgmentHistories: jhResult.changes };
  } finally {
    db.close();
  }
}

// ── 확인 프롬프트 ─────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  console.log('');
  if (isDryRun) {
    console.log('=== [DRY-RUN 모드] 실제로 삭제하지 않습니다 ===');
  }

  const uploadsFiles = collectFiles(UPLOADS_DIR);
  const inboxFiles = collectFiles(INBOX_DIR);
  const allFiles = [...uploadsFiles, ...inboxFiles];
  const { documents, judgmentHistories } = getDbCounts();

  const uploadsCount = uploadsFiles.length;
  const inboxCount = inboxFiles.length;
  const totalFiles = allFiles.length;

  console.log('');
  console.log('삭제 대상:');
  console.log(`  data/uploads/         파일 ${uploadsCount}건`);
  console.log(`  data/_inbox/          파일 ${inboxCount}건${!fs.existsSync(INBOX_DIR) ? ' (폴더 없음)' : ''}`);
  console.log(`  documents 테이블      레코드 ${documents}건`);
  console.log(`  judgment_histories    레코드 ${judgmentHistories}건`);
  console.log('');
  console.log('유지 대상: companies, workers, businesses, users 등 마스터 데이터');
  console.log('');

  if (isDryRun) {
    console.log('[DRY-RUN] 실행하면 위 내용이 삭제됩니다. --dry-run 없이 다시 실행하세요.');
    process.exit(0);
  }

  if (totalFiles === 0 && documents === 0 && judgmentHistories === 0) {
    console.log('삭제할 데이터가 없습니다.');
    process.exit(0);
  }

  const answer = await prompt(`파일 ${totalFiles}건, documents ${documents}건, judgment_histories ${judgmentHistories}건을 삭제합니다. 계속하시겠습니까? (y/N) `);

  if (answer !== 'y') {
    console.log('취소했습니다.');
    process.exit(0);
  }

  console.log('');
  console.log('삭제 중...');

  const deletedFiles = deleteFiles(allFiles);
  const { documents: deletedDocs, judgmentHistories: deletedJh } = deleteDbRecords();

  console.log('');
  console.log('=== 삭제 완료 ===');
  console.log(`  파일              ${deletedFiles}건 삭제 (uploads: ${uploadsCount}, _inbox: ${inboxCount})`);
  console.log(`  documents         ${deletedDocs}건 삭제`);
  console.log(`  judgment_histories ${deletedJh}건 삭제`);
  console.log('');
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
