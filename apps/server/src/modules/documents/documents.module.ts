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
import { BusinessesModule } from '../businesses/businesses.module';
import { RequiredDocumentsModule } from '../required-documents/required-documents.module';

@Module({
  imports: [TypeOrmModule.forFeature([Document, Company, Worker]), BusinessesModule, RequiredDocumentsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, GeminiService, FileConversionService, HwpToPdfConverter, ImageToPdfConverter],
  exports: [DocumentsService, FileConversionService],
})
export class DocumentsModule {}
