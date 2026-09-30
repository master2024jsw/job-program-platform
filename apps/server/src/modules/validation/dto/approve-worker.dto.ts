import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

class WorkerLedgerFieldsDto {
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() participationType?: string | null;
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsString() birthDate?: string | null;
  @IsOptional() @IsString() gender?: string | null;
  @IsOptional() @IsString() internStartDate?: string | null;
  @IsOptional() @IsString() internEndDate?: string | null;
}

export class ApproveWorkerDto {
  @IsString()
  businessId!: string;

  @IsString()
  companyId!: string;

  @ValidateNested()
  @Type(() => WorkerLedgerFieldsDto)
  reviewed!: WorkerLedgerFieldsDto;
}
