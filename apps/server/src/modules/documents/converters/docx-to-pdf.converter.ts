import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';

/**
 * DOCX → PDF 변환기.
 * Windows에 설치된 Microsoft Word를 COM(winax)으로 자동화해 PDF로 내보낸다.
 * HwpToPdfConverter와 동일한 winax 패턴을 사용한다.
 */
@Injectable()
export class DocxToPdfConverter {
  private readonly logger = new Logger(DocxToPdfConverter.name);

  async convert(docxPath: string, outputPdfPath: string): Promise<void> {
    let winax: typeof import('winax');
    try {
      winax = require('winax');
    } catch {
      throw new Error(
        'DOCX 변환을 사용할 수 없습니다. Windows 환경에 winax 네이티브 모듈이 빌드되어 있고 Microsoft Word가 설치되어 있어야 합니다.',
      );
    }

    const absDocxPath = path.resolve(docxPath);
    const absOutputPath = path.resolve(outputPdfPath);

    let word: import('winax').Object | undefined;
    try {
      word = new winax.Object('Word.Application');
      (word as unknown as Record<string, unknown>).Visible = false;

      const docs = (word as unknown as Record<string, unknown>).Documents as Record<string, unknown>;
      const doc = (docs.Open as (p: string) => Record<string, unknown>)(absDocxPath);

      // wdExportFormatPDF = 17
      (doc.ExportAsFixedFormat as (p: string, fmt: number) => void)(absOutputPath, 17);
      (doc.Close as (save: boolean) => void)(false);
    } finally {
      if (word) {
        try {
          (word as unknown as Record<string, unknown>).Quit = false;
        } catch (error) {
          this.logger.warn(`Word 프로세스 종료 중 오류: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  }
}
