import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  agency?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  publishedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  typeCode?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  applicationStartDate?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contact?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}
