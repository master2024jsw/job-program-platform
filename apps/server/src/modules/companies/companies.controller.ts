import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ApiResponse } from '@job-program/shared';
import type { CompanyRow } from '@job-program/shared';
import type { ImportSummary } from '../../common/excel.util';
import { CompaniesService, type ContactNormalizePreviewRow, type DedupeGroup } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpsertCompanyBusinessDto } from './dto/upsert-company-business.dto';
import { Company } from './company.entity';
import { CompanyBusiness } from './company-business.entity';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('export')
  async export(@Query('businessId') businessId: string | undefined, @Res() res: Response): Promise<void> {
    const buffer = await this.companiesService.exportToExcel(businessId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="companies.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Body('businessId') businessId: string | undefined,
  ): Promise<ApiResponse<ImportSummary>> {
    if (!file) {
      throw new NotFoundException('업로드된 엑셀 파일이 없습니다.');
    }
    const summary = await this.companiesService.importFromExcel(file.buffer, businessId);
    return { success: true, data: summary };
  }

  @Get('dedupe/preview')
  async previewDedupe(): Promise<ApiResponse<DedupeGroup[]>> {
    const data = await this.companiesService.previewDedupe();
    return { success: true, data };
  }

  @Post('dedupe/confirm')
  async confirmDedupe(): Promise<ApiResponse<{ merged: number }>> {
    const data = await this.companiesService.confirmDedupe();
    return { success: true, data };
  }

  @Get('normalize-contacts/preview')
  async previewNormalize(): Promise<ApiResponse<ContactNormalizePreviewRow[]>> {
    const data = await this.companiesService.previewNormalizeContacts();
    return { success: true, data };
  }

  @Post('normalize-contacts/confirm')
  async confirmNormalize(): Promise<ApiResponse<{ updated: number }>> {
    const data = await this.companiesService.confirmNormalizeContacts();
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateCompanyDto): Promise<ApiResponse<Company>> {
    const company = await this.companiesService.create(dto);
    return { success: true, data: company };
  }

  @Get()
  async findAll(
    @Query('keyword') keyword?: string,
    @Query('businessId') businessId?: string,
    @Query('contactableOnly') contactableOnly?: 'true' | 'false',
  ): Promise<ApiResponse<CompanyRow[]>> {
    const companies = await this.companiesService.findAll({ keyword, businessId, contactableOnly });
    return { success: true, data: companies };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<Company>> {
    const company = await this.companiesService.findOne(id);
    return { success: true, data: company };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto): Promise<ApiResponse<Company>> {
    const company = await this.companiesService.update(id, dto);
    return { success: true, data: company };
  }

  @Put(':id/business')
  async upsertBusiness(
    @Param('id') id: string,
    @Body() dto: UpsertCompanyBusinessDto,
  ): Promise<ApiResponse<CompanyBusiness>> {
    const data = await this.companiesService.upsertCompanyBusiness(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.companiesService.remove(id);
    return { success: true };
  }
}
