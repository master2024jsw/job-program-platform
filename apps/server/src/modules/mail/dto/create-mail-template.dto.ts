import { CompanyStage } from '@job-program/shared';
import { IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';

export class CreateMailTemplateDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  body!: string;

  /** 이 템플릿으로 보내면 기업 단계를 여기까지 올린다. 비워두면 단계를 바꾸지 않는다(독촉 메일 등). */
  @IsOptional()
  @IsEnum(CompanyStage)
  advanceToStage?: CompanyStage | null;
}
