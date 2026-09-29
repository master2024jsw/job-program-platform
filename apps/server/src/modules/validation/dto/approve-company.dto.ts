import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class CompanyLedgerFieldsDto {
  @IsOptional() @IsString() businessRegistrationNumber?: string | null;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() representativeName?: string | null;
  @IsOptional() @IsInt() @Min(0) generalTypeCount?: number | null;
  @IsOptional() @IsInt() @Min(0) intergenerationalTypeCount?: number | null;
  @IsOptional() @IsInt() @Min(0) plannedHeadcount?: number | null;
  @IsOptional() @IsString() recruitJobTitle?: string | null;
  @IsOptional() @IsString() recruitJobCode?: string | null;
  @IsOptional() @IsString() jobEligibility?: string | null;
}

export class ApproveCompanyDto {
  @IsString()
  businessId!: string;

  @ValidateNested()
  @Type(() => CompanyLedgerFieldsDto)
  reviewed!: CompanyLedgerFieldsDto;
}
