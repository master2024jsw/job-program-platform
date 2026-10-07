import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './document.entity';
import { Company } from '../companies/company.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Worker } from '../workers/worker.entity';
import { Business } from '../businesses/business.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { GeminiService } from './gemini.service';
import { FileConversionService } from './file-conversion.service';
import { HwpToPdfConverter } from './converters/hwp-to-pdf.converter';
import { ImageToPdfConverter } from './converters/image-to-pdf.converter';
import { DocxToPdfConverter } from './converters/docx-to-pdf.converter';
import { PdfToMarkdownConverter } from './converters/pdf-to-markdown.converter';
import { BusinessesModule } from '../businesses/businesses.module';
import { RequiredDocumentsModule } from '../required-documents/required-documents.module';
import { ValidationModule } from '../validation/validation.module';
import { FileRouterService } from './file-router.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, Company, CompanyBusiness, Worker, Business]),
    BusinessesModule,
    RequiredDocumentsModule,
    ValidationModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, GeminiService, FileConversionService, FileRouterService, HwpToPdfConverter, ImageToPdfConverter, DocxToPdfConverter, PdfToMarkdownConverter],
  exports: [DocumentsService, FileConversionService],
})
export class DocumentsModule {}
