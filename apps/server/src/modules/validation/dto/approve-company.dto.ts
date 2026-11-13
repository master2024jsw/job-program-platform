import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

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
  @IsOptional() @IsString() participationType?: string | null;
}

export class ApproveCompanyDto {
  @IsString()
  businessId!: string;

  @ValidateNested()
  @Type(() => CompanyLedgerFieldsDto)
  reviewed!: CompanyLedgerFieldsDto;

  /**
   * 승인 사유(예외 판단 근거) — 선택. 걸린 규칙을 그대로 승인할 때 왜 그랬는지 남긴다.
   * 이 값이 쌓여 예외 후보가 되고, 나중에 예외 규칙의 출처가 된다(심사③).
   * 개인정보가 섞여도 저장 전에 주민번호는 마스킹한다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}
