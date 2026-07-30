import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ApiResponse } from '@job-program/shared';
import type { ImportSummary } from '../../common/excel.util';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './company.entity';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('export')
  async export(@Res() res: Response): Promise<void> {
    const buffer = await this.companiesService.exportToExcel();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="companies.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File): Promise<ApiResponse<ImportSummary>> {
    if (!file) {
      throw new NotFoundException('업로드된 엑셀 파일이 없습니다.');
    }
    const summary = await this.companiesService.importFromExcel(file.buffer);
    return { success: true, data: summary };
  }

  @Post()
  async create(@Body() dto: CreateCompanyDto): Promise<ApiResponse<Company>> {
    const company = await this.companiesService.create(dto);
    return { success: true, data: company };
  }

  @Get()
  async findAll(@Query('keyword') keyword?: string): Promise<ApiResponse<Company[]>> {
    const companies = await this.companiesService.findAll(keyword);
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

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.companiesService.remove(id);
    return { success: true };
  }
}
