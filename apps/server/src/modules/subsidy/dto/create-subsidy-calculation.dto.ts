import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateSubsidyCalculationDto {
  @IsString()
  businessId!: string;

  @IsUUID()
  workerId!: string;

  @IsString()
  @MaxLength(50)
  periodLabel!: string;

  @IsInt()
  @Min(0)
  workedDays!: number;
}
