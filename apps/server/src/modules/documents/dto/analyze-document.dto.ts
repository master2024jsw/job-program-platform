import { IsOptional, IsString } from 'class-validator';

export class AnalyzeDocumentDto {
  @IsOptional()
  @IsString()
  prompt?: string;
}
