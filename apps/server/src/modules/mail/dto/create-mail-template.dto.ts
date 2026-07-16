import { IsString, MaxLength } from 'class-validator';

export class CreateMailTemplateDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  body!: string;
}
