import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CompanyStatus } from '@job-program/shared';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class CreateCompanyDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(/^\d{3}-?\d{2}-?\d{5}$/, { message: '사업자등록번호 형식이 올바르지 않습니다. (예: 123-45-67890)' })
  businessRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  representativeName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fax?: string;

  @IsOptional()
  @IsString()
  industryType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsString()
  memo?: string;
}
