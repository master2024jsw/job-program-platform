import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { MailTemplatesService } from './mail-templates.service';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';
import { MailTemplate } from './mail-template.entity';

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
}
