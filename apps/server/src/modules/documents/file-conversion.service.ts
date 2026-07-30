import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { HwpToPdfConverter } from './converters/hwp-to-pdf.converter';
import { ImageToPdfConverter } from './converters/image-to-pdf.converter';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const CONVERTIBLE_EXTENSIONS = new Set(['.hwp', ...IMAGE_EXTENSIONS]);

@Injectable()
export class FileConversionService {
  constructor(
    private readonly hwpConverter: HwpToPdfConverter,
    private readonly imageConverter: ImageToPdfConverter,
  ) {}

  needsConversion(filePath: string): boolean {
    return CONVERTIBLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  /** filePath를 PDF로 변환하고, 변환된 파일 경로를 반환한다. */
  async convertToPdf(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const outputPath = `${filePath.slice(0, -ext.length)}.pdf`;

    if (ext === '.hwp') {
      await this.hwpConverter.convert(filePath, outputPath);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      await this.imageConverter.convert(filePath, outputPath);
    } else {
      throw new Error(`지원하지 않는 변환 형식입니다: ${ext}`);
    }

    return outputPath;
  }
}
