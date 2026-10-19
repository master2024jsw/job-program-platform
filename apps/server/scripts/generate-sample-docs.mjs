/**
 * 합성 테스트 서류 PDF 생성기.
 *
 * Electron(Chromium)의 printToPDF 로 HTML 을 PDF 로 변환한다.
 * 별도 PDF 라이브러리를 설치하지 않아도 되고, 한글 폰트가 그대로 적용된다.
 *
 * 실행:  npm run sample:docs
 * 결과:  apps/server/scripts/fixtures/out/ 아래에 단계별 폴더로 PDF 가 생성된다.
 *
 * 자료 내용을 바꾸려면 fixtures/sample-case.json 을 수정하고 다시 실행하면 된다.
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDocuments } from './fixtures/doc-templates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, 'fixtures');
const outDir = path.join(fixtureDir, 'out');

/** 서류를 단계별 폴더로 나눠 담는다 — 문서함에 올릴 때 헷갈리지 않게. */
const STAGE_OF = {
  COMPANY_APPLICATION: '1_기업적격',
  BUSINESS_REGISTRATION: '1_기업적격',
  WORKPLACE_INSURANCE: '1_기업적격',
  OPERATION_PLAN: '1_기업적격',
  WORKER_APPLICATION: '2_참여자적격',
  PRIVACY_CONSENT: '2_참여자적격',
  RESIDENT_ABSTRACT: '2_참여자적격',
  EMPLOYMENT_INSURANCE_HISTORY: '2_참여자적격',
  ELIGIBILITY_CONFIRM: '2_참여자적격',
  LABOR_CONTRACT: '2_참여자적격',
  EDUCATION_LEDGER: '2_참여자적격',
  SUBSIDY_APPLICATION: '3_지원금신청',
  SUBSIDY_CALCULATION: '3_지원금신청',
  INSURANCE_ROSTER: '3_지원금신청',
  PAYROLL: '3_지원금신청',
  SALARY_TRANSFER: '3_지원금신청',
  BANK_ACCOUNT_COPY: '3_지원금신청',
};

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'sample-case.json'), 'utf-8'));
  const docs = buildDocuments(data);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false },
  });

  console.log('');
  console.log(`합성 테스트 서류 ${docs.length}종을 만듭니다.`);
  console.log(`기업: ${data.company.name} / 참여자: ${data.worker.name} (${data.worker.birthDate})`);
  console.log('');

  let n = 0;
  for (const doc of docs) {
    const stage = STAGE_OF[doc.code] ?? '기타';
    const dir = path.join(outDir, stage);
    fs.mkdirSync(dir, { recursive: true });

    // 파일명에 서류코드를 넣어 두면 문서함에서 유형을 고르기 쉽다.
    const base = `${String(++n).padStart(2, '0')}_${doc.label}_${doc.code}`;
    const htmlPath = path.join(dir, base + '.html');
    const pdfPath = path.join(dir, base + '.pdf');

    fs.writeFileSync(htmlPath, doc.html, 'utf-8');
    await win.loadURL(pathToFileURL(htmlPath).href);
    // 폰트가 적용된 뒤 렌더링되도록 한 틱 기다린다.
    await new Promise((r) => setTimeout(r, 120));

    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'default' },
    });
    fs.writeFileSync(pdfPath, pdf);
    fs.rmSync(htmlPath, { force: true }); // HTML 은 중간 산출물이라 지운다

    console.log(`  [${stage}] ${doc.label} (${doc.code})`);
  }

  // 사람이 읽을 안내문도 같이 남긴다.
  const readme = [
    '# 합성 테스트 서류',
    '',
    '실제 개인정보가 아닙니다. 테스트 외 용도로 쓰지 마세요.',
    '',
    `- 기업: ${data.company.name} (사업자등록번호 ${data.company.businessRegistrationNumber})`,
    `- 참여자: ${data.worker.name} (${data.worker.birthDate}, 만 ${2026 - 1962}세)`,
    `- 인턴기간: ${data.intern.startDate} ~ ${data.intern.endDate}`,
    `- 월 급여: ${Number(data.intern.monthlySalary).toLocaleString('ko-KR')}원`,
    `- 지원금: 인턴 3회차 x 400,000원 = ${Number(data.subsidy.totalAmount).toLocaleString('ko-KR')}원`,
    '',
    '## 올리는 순서',
    '',
    '1. `1_기업적격` — 기업 등록 후 문서함에 올려 기업 검증',
    '2. `2_참여자적격` — 근로자 등록 후 올려 근로자 검증',
    '3. `3_지원금신청` — 지원금 신청 검증',
    '',
    '값은 서로 맞춰져 있어 검증이 통과하도록 만들었습니다.',
    '값을 바꾸려면 `fixtures/sample-case.json` 을 고치고 `npm run sample:docs` 를 다시 실행하세요.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), readme, 'utf-8');

  console.log('');
  console.log(`완료 — ${outDir}`);
  console.log('');

  win.destroy();
  app.quit();
}

app.whenReady().then(() =>
  main().catch((e) => {
    console.error('생성 실패:', e);
    process.exitCode = 1;
    app.quit();
  }),
);
