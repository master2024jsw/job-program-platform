import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class SendGuidanceDto {
  @IsString()
  businessId!: string;

  @IsString()
  templateId!: string;

  /** 선택한 근로자들. 서버가 기업별로 묶어 기업 메일로 한 통씩 보낸다. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  workerIds!: string[];
}
