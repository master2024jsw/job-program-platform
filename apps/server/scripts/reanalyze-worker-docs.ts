/**
 * 근로자 서류 5종 재분석 스크립트
 * HTTP 인증 없이 NestJS 서비스를 직접 호출.
 * 실행: npx ts-node -P apps/server/tsconfig.json apps/server/scripts/reanalyze-worker-docs.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentsService } from '../src/modules/documents/documents.service';

const DOC_IDS = [
  { id: '65544cc8-1849-4695-8d8e-644f3347b3eb', label: '신청서' },
  { id: 'c2342f21-f5d8-49de-b712-6664a763d87e', label: '초본' },
  { id: 'dce02e9b-2a67-43c0-be07-6049cbb7658d', label: '개인정보동의서' },
  { id: 'c8a2bbbf-5369-42a0-b52a-942354bad686', label: '근로계약서' },
  { id: 'f9297341-6643-4cf2-9b91-21cdad53311a', label: '적격확인서' },
];

async function main() {
  console.log('NestJS 앱 컨텍스트 초기화...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error', 'log'] });
  const docsService = app.get(DocumentsService);

  for (const { id, label } of DOC_IDS) {
    console.log(`\n── ${label} (${id}) 재분석 시작 ──`);
    try {
      const doc = await docsService.analyze(id, {});
      const data = (doc as unknown as { extractedData: Record<string, unknown> }).extractedData ?? {};
      console.log(`  ✅ status=${doc.status}, workerId=${doc.workerId}`);
      console.log(`  residentNumber=${data.residentNumber ?? '(없음)'}, birthDate=${data.birthDate ?? '(없음)'}`);
    } catch (e) {
      console.error(`  ❌ 실패: ${e instanceof Error ? e.message : e}`);
    }
    // API 과부하 방지
    await new Promise((r) => setTimeout(r, 2000));
  }

  await app.close();
  console.log('\n완료.');
}

main().catch((e) => { console.error(e); process.exit(1); });
