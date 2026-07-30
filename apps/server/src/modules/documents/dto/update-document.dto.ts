import { IsEnum, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { DocumentAnalysisStatus } from '@job-program/shared';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  documentType?: string;

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
