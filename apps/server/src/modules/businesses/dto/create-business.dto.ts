import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreateBusinessDto {
  @IsString()
  name!: string;

  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: '유형코드는 영문 대문자·숫자·언더스코어만 사용할 수 있습니다.' })
  typeCode!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  baseYear!: number;
}
