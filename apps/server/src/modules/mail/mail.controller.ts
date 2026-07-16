import { Body, Controller, Get, Post } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { MailService } from './mail.service';
import { SendMailDto } from './dto/send-mail.dto';
import { MailLog } from './mail-log.entity';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  async send(@Body() dto: SendMailDto): Promise<ApiResponse<MailLog[]>> {
    const logs = await this.mailService.send(dto);
    return { success: true, data: logs };
  }

  @Get('logs')
  async findLogs(): Promise<ApiResponse<MailLog[]>> {
    const logs = await this.mailService.findLogs();
    return { success: true, data: logs };
  }
}
