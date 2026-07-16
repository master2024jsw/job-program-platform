import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CompanyStatus } from '@job-program/shared';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: '사업자등록번호는 하이픈 없는 숫자 10자리여야 합니다.' })
  businessRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  representativeName?: string;

  @IsOptional()
  @IsString()
  industryType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  contactManagerName?: string;

  @IsOptional()
  @IsString()
  contactManagerPhone?: string;

  @IsOptional()
  @IsEmail()
  contactManagerEmail?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsString()
  memo?: string;
}
