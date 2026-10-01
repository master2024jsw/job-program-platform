import { Injectable } from '@nestjs/common';
import * as fsSync from 'fs';

/**
 * PDF → Markdown 변환기.
 * pdf-parse 라이브러리로 텍스트를 추출해 Markdown 형식으로 반환한다.
 * Gemini AI 입력용 토큰 절약 경로에서 사용한다.
 */
@Injectable()
export class PdfToMarkdownConverter {
  async convert(pdfPath: string): Promise<string> {
    // pdf-parse는 CJS 모듈이므로 require로 로드한다
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (
      buf: Buffer,
      opts?: Record<string, unknown>,
    ) => Promise<{ text: string; numpages: number }>;

    const buffer = fsSync.readFileSync(pdfPath);
    const data = await pdfParse(buffer);

    const cleaned = data.text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return `# 문서 텍스트 (${data.numpages}페이지)\n\n${cleaned}`;
  }
}
