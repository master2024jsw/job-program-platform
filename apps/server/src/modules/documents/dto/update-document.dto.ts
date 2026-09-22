import { IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { DOCUMENT_TYPE_CODES, DocumentAnalysisStatus, type DocumentTypeCode } from '@job-program/shared';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPE_CODES)
  documentType?: DocumentTypeCode;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;

  @IsOptional()
  @IsObject()
  reviewedData?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(DocumentAnalysisStatus)
  status?: DocumentAnalysisStatus;
}
