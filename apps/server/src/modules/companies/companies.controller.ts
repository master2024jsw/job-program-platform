import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './company.entity';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

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
