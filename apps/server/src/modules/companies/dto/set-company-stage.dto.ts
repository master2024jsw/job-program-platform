import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CompanyStage } from '@job-program/shared';

export class SetCompanyStageDto {
  @IsEnum(CompanyStage)
  stage!: CompanyStage;

  /** 왜 바꿨는지. 되돌리기(역행)를 허용하므로 사유가 남아야 한다. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
