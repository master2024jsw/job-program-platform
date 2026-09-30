import { IsString } from 'class-validator';

export class ApproveSubsidyDto {
  @IsString()
  businessId!: string;

  @IsString()
  companyId!: string;
}
