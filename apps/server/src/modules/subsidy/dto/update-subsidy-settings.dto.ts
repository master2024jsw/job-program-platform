import { IsInt, IsString, Max, Min } from 'class-validator';

export class UpdateSubsidySettingsDto {
  @IsString()
  businessId!: string;

  @IsInt()
  @Min(1)
  @Max(36)
  eligibilityMonths!: number;
}
