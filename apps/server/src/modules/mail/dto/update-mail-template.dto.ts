import { CompanyStage } from '@job-program/shared';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  /** 이 템플릿으로 보내면 기업 단계를 여기까지 올린다. 비워두면 단계를 바꾸지 않는다(독촉 메일 등). */
  @IsOptional()
  @IsEnum(CompanyStage)
  advanceToStage?: CompanyStage | null;
}
