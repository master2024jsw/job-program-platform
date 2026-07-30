import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './document.entity';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { GeminiService } from './gemini.service';
import { FileConversionService } from './file-conversion.service';
import { HwpToPdfConverter } from './converters/hwp-to-pdf.converter';
import { ImageToPdfConverter } from './converters/image-to-pdf.converter';

@Module({
  imports: [TypeOrmModule.forFeature([Document, Company, Worker])],
  controllers: [DocumentsController],
  providers: [DocumentsService, GeminiService, FileConversionService, HwpToPdfConverter, ImageToPdfConverter],
  exports: [DocumentsService, FileConversionService],
})
export class DocumentsModule {}
