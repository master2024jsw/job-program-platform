import { Body, Controller, Get, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { ApiResponse, SessionUser } from '@job-program/shared';
import { MailService, type AdHocAttachment } from './mail.service';
import { SendMailDto } from './dto/send-mail.dto';
import { MailLog } from './mail-log.entity';
import { CurrentUser } from '../auth/current-user.decorator';
import { BusinessesService } from '../businesses/businesses.service';

interface UploadedFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

/** Multer가 latin1로 준 한글 파일명을 UTF-8로 복원한다. */
function decodeFileName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

function parseJsonField<T>(raw: string | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly businessesService: BusinessesService,
  ) {}

  @Post('send')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async send(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @CurrentUser() user: SessionUser,
  ): Promise<ApiResponse<MailLog[]>> {
    const dto: SendMailDto = {
      businessId: body.businessId,
      to: parseJsonField<string[]>(body.to),
      companyId: body.companyId || undefined,
      workerId: body.workerId || undefined,
      templateId: body.templateId || undefined,
      subject: body.subject || undefined,
      body: body.body || undefined,
      variables: parseJsonField<Record<string, string>>(body.variables),
    };

    // multipart 요청은 BusinessAccessGuard가 body를 못 보므로 여기서 직접 검증한다.
    if (dto.businessId) {
      await this.businessesService.assertAccess(user, dto.businessId);
    }

    const adHoc: AdHocAttachment[] = (files ?? []).map((f) => ({
      filename: decodeFileName(f.originalname),
      content: f.buffer,
      contentType: f.mimetype,
    }));

    const logs = await this.mailService.send(dto, adHoc);
    return { success: true, data: logs };
  }

  @Get('logs')
  async findLogs(@Query('businessId') businessId?: string): Promise<ApiResponse<MailLog[]>> {
    const logs = await this.mailService.findLogs(businessId);
    return { success: true, data: logs };
  }
}
