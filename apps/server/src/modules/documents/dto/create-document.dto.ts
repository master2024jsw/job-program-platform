import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  businessId!: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;
}
