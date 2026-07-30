import { Controller, Post } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { MailCollectorService, type CollectSummary } from './mail-collector.service';

@Controller('mail-collector')
export class MailCollectorController {
  constructor(private readonly mailCollectorService: MailCollectorService) {}

  @Post('collect')
  async collect(): Promise<ApiResponse<CollectSummary>> {
    const summary = await this.mailCollectorService.collect();
    return { success: true, data: summary };
  }
}
