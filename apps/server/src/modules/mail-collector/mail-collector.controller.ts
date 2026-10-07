import { Body, Controller, Post } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import type { ApiResponse } from '@job-program/shared';
import { MailCollectorService, type CollectSummary } from './mail-collector.service';

class CollectDto {
  @IsOptional()
  @IsDateString()
  since?: string; // YYYY-MM-DD

  @IsOptional()
  @IsDateString()
  before?: string; // YYYY-MM-DD
}

@Controller('mail-collector')
export class MailCollectorController {
  constructor(private readonly mailCollectorService: MailCollectorService) {}

  @Post('collect')
  async collect(@Body() dto: CollectDto): Promise<ApiResponse<CollectSummary>> {
    const summary = await this.mailCollectorService.collect({
      since: dto.since ? new Date(dto.since) : undefined,
      before: dto.before ? new Date(dto.before) : undefined,
    });
    return { success: true, data: summary };
  }
}
