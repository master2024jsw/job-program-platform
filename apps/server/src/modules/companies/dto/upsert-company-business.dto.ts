import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class UpsertCompanyBusinessDto {
  @IsString()
  businessId!: string;

  @IsOptional()
  @IsString()
  participationType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  plannedHeadcount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  generalTypeHeadcount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  intergenerationalTypeHeadcount?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  agreementSentDate?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  agreementDate?: string;

  @IsOptional()
  @IsBoolean()
  agreementConcluded?: boolean;

  @IsOptional()
  @IsBoolean()
  businessPlanRegistered?: boolean;

  @IsOptional()
  @IsBoolean()
  documentGuideSent?: boolean;

  @IsOptional()
  @IsBoolean()
  participantApplied?: boolean;
}
