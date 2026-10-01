import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DocxConversionResult {
  /** Word COM 실패 시 mammoth로 추출한 텍스트. 있으면 MD 파일로 직접 저장한다. */
  markdownText?: string;
}

/**
 * DOCX → PDF 변환기.
 * 1차: Windows COM(winax)으로 Word를 자동화해 PDF 내보내기.
 * 폴백: mammoth로 텍스트 추출 → 스텁 PDF 생성 + 추출 텍스트 반환.
 *   - 스텁 PDF는 한글이 렌더링되지 않으나 파일 참조용으로 존재.
 *   - 전체 텍스트는 markdownText로 반환해 .md 파일로 직접 저장된다.
 */
@Injectable()
export class DocxToPdfConverter {
  private readonly logger = new Logger(DocxToPdfConverter.name);

  async convert(docxPath: string, outputPdfPath: string): Promise<DocxConversionResult> {
    // ── 1차 시도: Word COM ─────────────────────────────────────────────
    try {
      await this.convertViaWordCom(docxPath, outputPdfPath);
      return {};
    } catch (error) {
      this.logger.warn(
        `Word COM 변환 실패(${path.basename(docxPath)}): ${error instanceof Error ? error.message : error}. mammoth 폴백으로 전환합니다.`,
      );
    }

    // ── 2차 시도: mammoth 텍스트 추출 폴백 ───────────────────────────
    const markdownText = await this.extractTextViaMammoth(docxPath);
    await this.createStubPdf(outputPdfPath, path.basename(docxPath));
    return { markdownText };
  }

  // ── private helpers ──────────────────────────────────────────────────

  private async convertViaWordCom(docxPath: string, outputPdfPath: string): Promise<void> {
    let winax: typeof import('winax');
    try {
      winax = require('winax');
    } catch {
      throw new Error('winax 네이티브 모듈을 로드할 수 없습니다.');
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
        } catch (quitErr) {
          this.logger.warn(`Word 프로세스 종료 오류: ${quitErr instanceof Error ? quitErr.message : quitErr}`);
        }
      }
    }
  }

  private async extractTextViaMammoth(docxPath: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as {
      extractRawText(opts: { path: string }): Promise<{ value: string; messages: unknown[] }>;
    };
    const result = await mammoth.extractRawText({ path: docxPath });
    const cleaned = result.value
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return `# ${path.basename(docxPath, '.docx')}\n\n${cleaned}`;
  }

  /**
   * Word 없이 변환된 경우 인간 검토자를 위한 안내 스텁 PDF를 생성한다.
   * 한글 텍스트는 포함하지 않으며, 전체 내용은 .md 파일을 참조하도록 안내한다.
   */
  private async createStubPdf(outputPdfPath: string, originalFileName: string): Promise<void> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const lines = [
      { text: 'DOCX Conversion Notice', size: 16, font: bold, y: 780 },
      { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 10, font, y: 760 },
      { text: `File: ${originalFileName}`, size: 11, font, y: 735 },
      { text: `Converted: ${now}`, size: 11, font, y: 715 },
      { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 10, font, y: 695 },
      { text: 'Microsoft Word was not found on this system.', size: 11, font, y: 670 },
      { text: 'Text content has been extracted via mammoth.', size: 11, font, y: 650 },
      { text: 'Full content (including Korean text) is in the .md file.', size: 11, font, y: 630 },
      { text: 'For visual review, open the original .docx file directly.', size: 11, font, y: 610 },
    ];

    for (const line of lines) {
      page.drawText(line.text, { x: 50, y: line.y, size: line.size, font: line.font, color: rgb(0.1, 0.1, 0.1) });
    }

    await fs.writeFile(outputPdfPath, await pdf.save());
  }
}
