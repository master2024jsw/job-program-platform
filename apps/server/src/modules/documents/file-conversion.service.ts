import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { HwpToPdfConverter } from './converters/hwp-to-pdf.converter';
import { ImageToPdfConverter } from './converters/image-to-pdf.converter';
import { DocxToPdfConverter } from './converters/docx-to-pdf.converter';
import { PdfToMarkdownConverter } from './converters/pdf-to-markdown.converter';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const CONVERTIBLE_EXTENSIONS = new Set(['.hwp', '.docx', ...IMAGE_EXTENSIONS]);

@Injectable()
export class FileConversionService {
  constructor(
    private readonly hwpConverter: HwpToPdfConverter,
    private readonly imageConverter: ImageToPdfConverter,
    private readonly docxConverter: DocxToPdfConverter,
    private readonly pdfToMarkdown: PdfToMarkdownConverter,
  ) {}

  needsConversion(filePath: string): boolean {
    return CONVERTIBLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  isZip(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.zip';
  }

  /**
   * ZIP 파일에서 내부 파일을 extractDir에 추출하고 경로 목록을 반환한다.
   * 숨김 파일(. 또는 __로 시작)과 디렉터리는 건너뛴다.
   */
  extractZip(zipPath: string, extractDir: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip') as new (p: string) => {
      getEntries(): Array<{ entryName: string; isDirectory: boolean; getData(): Buffer }>;
    };

    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const extracted: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const basename = path.basename(entry.entryName);
      if (!basename || basename.startsWith('.') || basename.startsWith('__')) continue;

      const outputPath = path.join(extractDir, basename);
      fs.writeFileSync(outputPath, entry.getData());
      extracted.push(outputPath);
    }

    return extracted;
  }

  /**
   * filePath를 PDF로 변환하고 결과를 반환한다.
   * DOCX에서 Word COM 폴백(mammoth)이 사용된 경우 markdownText가 함께 반환된다.
   */
  async convertToPdf(filePath: string): Promise<{ pdfPath: string; markdownText?: string }> {
    const ext = path.extname(filePath).toLowerCase();
    const outputPath = `${filePath.slice(0, -ext.length)}.pdf`;

    if (ext === '.hwp') {
      await this.hwpConverter.convert(filePath, outputPath);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      await this.imageConverter.convert(filePath, outputPath);
    } else if (ext === '.docx') {
      const result = await this.docxConverter.convert(filePath, outputPath);
      return { pdfPath: outputPath, markdownText: result.markdownText };
    } else {
      throw new Error(`지원하지 않는 변환 형식입니다: ${ext}`);
    }

    return { pdfPath: outputPath };
  }

  /**
   * PDF 텍스트를 추출해 Markdown 문자열로 반환한다.
   * AI 입력 토큰 절약 경로에서 사용한다.
   */
  async extractMarkdown(pdfPath: string): Promise<string> {
    return this.pdfToMarkdown.convert(pdfPath);
  }
}
