import { Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ImageToPdfConverter {
  async convert(imageFilePath: string, outputPdfPath: string): Promise<void> {
    const imageBytes = await fs.readFile(imageFilePath);
    const pdfDoc = await PDFDocument.create();

    const ext = path.extname(imageFilePath).toLowerCase();
    const image = ext === '.png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPdfPath, pdfBytes);
  }
}
