import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { DOCUMENT_TYPE_CODES, type DocumentTypeCode } from '@job-program/shared';

export class CreateDocumentDto {
  @IsString()
  businessId!: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPE_CODES)
  documentType?: DocumentTypeCode;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;
}
