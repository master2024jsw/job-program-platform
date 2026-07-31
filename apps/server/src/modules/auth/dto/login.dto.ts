import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  loginId!: string;

  @IsString()
  password!: string;

  /** true면 브라우저를 닫아도 세션 쿠키가 유지된다. 공용 PC 전제이므로 기본값은 false. */
  @IsOptional()
  @IsBoolean()
  keepLoggedIn?: boolean;
}
