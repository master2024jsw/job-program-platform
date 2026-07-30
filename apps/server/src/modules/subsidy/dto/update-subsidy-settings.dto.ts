import { IsInt, Max, Min } from 'class-validator';

export class UpdateSubsidySettingsDto {
  @IsInt()
  @Min(1)
  @Max(36)
  eligibilityMonths!: number;
}
