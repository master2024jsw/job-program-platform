import { IsInt, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class SetupDto {
  @IsString()
  @MinLength(2)
  institutionName!: string;

  @IsString()
  @MinLength(4)
  adminLoginId!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsString()
  businessName!: string;

  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: '유형코드는 영문 대문자·숫자·언더스코어만 사용할 수 있습니다.' })
  businessTypeCode!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  businessBaseYear!: number;
}
