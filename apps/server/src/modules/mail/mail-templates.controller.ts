import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { ApiResponse, MailAttachmentMeta } from '@job-program/shared';
import { MailTemplatesService } from './mail-templates.service';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';
import { MailTemplate } from './mail-template.entity';

interface UploadedFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

@Controller('mail-templates')
export class MailTemplatesController {
  constructor(private readonly mailTemplatesService: MailTemplatesService) {}

  @Post()
  async create(@Body() dto: CreateMailTemplateDto): Promise<ApiResponse<MailTemplate>> {
    const template = await this.mailTemplatesService.create(dto);
    return { success: true, data: template };
  }

  @Get()
  async findAll(): Promise<ApiResponse<MailTemplate[]>> {
    const templates = await this.mailTemplatesService.findAll();
    return { success: true, data: templates };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<MailTemplate>> {
    const template = await this.mailTemplatesService.findOne(id);
    return { success: true, data: template };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMailTemplateDto): Promise<ApiResponse<MailTemplate>> {
    const template = await this.mailTemplatesService.update(id, dto);
    return { success: true, data: template };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.mailTemplatesService.remove(id);
    return { success: true };
  }

  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async addAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: UploadedFile[],
  ): Promise<ApiResponse<MailAttachmentMeta[]>> {
    if (!files?.length) throw new BadRequestException('첨부할 파일이 없습니다.');
    const saved = await this.mailTemplatesService.addAttachments(id, files);
    const meta: MailAttachmentMeta[] = saved.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    }));
    return { success: true, data: meta };
  }

  @Delete(':id/attachments/:attachmentId')
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<ApiResponse<null>> {
    await this.mailTemplatesService.removeAttachment(id, attachmentId);
    return { success: true };
  }
}
