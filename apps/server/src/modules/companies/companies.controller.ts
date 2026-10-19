import {
  BadRequestException,
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
import { COMPANY_STAGES, CompanyStage } from '@job-program/shared';
import type { SessionUser, ApiResponse } from '@job-program/shared';
import type { CompanyRow } from '@job-program/shared';
import type { ImportSummary } from '../../common/excel.util';
import { CompaniesService, type ContactNormalizePreviewRow, type DedupeGroup } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpsertCompanyBusinessDto } from './dto/upsert-company-business.dto';
import { Company } from './company.entity';
import { CompanyBusiness } from './company-business.entity';
import { CompanyStageService } from './company-stage.service';
import { CompanyStageChange } from './company-stage-change.entity';
import { SetCompanyStageDto } from './dto/set-company-stage.dto';
import { BusinessesService } from '../businesses/businesses.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly companyStageService: CompanyStageService,
    private readonly businessesService: BusinessesService,
  ) {}

  @Get('export')
  async export(@Query('businessId') businessId: string | undefined, @Res() res: Response): Promise<void> {
    const buffer = await this.companiesService.exportToExcel(businessId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="companies.xlsx"',
    });
    res.send(buffer);
  }

  /** 4단계 기업신청 대장('2026년 참여기업 관리' 시트 형식) 내보내기. */
  @Get('ledger/export')
  async exportLedger(@Query('businessId') businessId: string, @Res() res: Response): Promise<void> {
    const buffer = await this.companiesService.exportBusinessLedger(businessId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="company-ledger.xlsx"',
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
    @Query('stage') stage?: CompanyStage,
  ): Promise<ApiResponse<CompanyRow[]>> {
    if (stage && !COMPANY_STAGES.includes(stage)) {
      throw new BadRequestException(`알 수 없는 단계입니다: ${stage}`);
    }
    const companies = await this.companiesService.findAll({ keyword, businessId, stage });
    return { success: true, data: companies };
  }

  /** 단계 수동 변경 — 되돌리기(역행)도 허용하되 사유와 사람을 기록한다. */
  @Patch(':id/stage')
  async setStage(
    @CurrentUser() user: SessionUser,
    @Param('id') companyId: string,
    @Query('businessId') businessId: string | undefined,
    @Body() dto: SetCompanyStageDto,
  ): Promise<ApiResponse<CompanyBusiness>> {
    if (!businessId) throw new BadRequestException('businessId 가 필요합니다.');
    await this.businessesService.assertAccess(user, businessId);
    const cb = await this.companiesService.getCompanyBusiness(companyId, businessId);
    if (!cb) throw new NotFoundException('이 기업은 해당 사업에 참여하지 않았습니다.');
    const saved = await this.companyStageService.setManually(cb.id, dto.stage, dto.reason ?? null, user);
    return { success: true, data: saved as unknown as CompanyBusiness };
  }

  /** 단계 변경 이력 (최신순) */
  @Get(':id/stage/history')
  async stageHistory(
    @CurrentUser() user: SessionUser,
    @Param('id') companyId: string,
    @Query('businessId') businessId: string | undefined,
  ): Promise<ApiResponse<CompanyStageChange[]>> {
    if (!businessId) throw new BadRequestException('businessId 가 필요합니다.');
    await this.businessesService.assertAccess(user, businessId);
    const cb = await this.companiesService.getCompanyBusiness(companyId, businessId);
    if (!cb) return { success: true, data: [] };
    return { success: true, data: await this.companyStageService.history(cb.id) };
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
  async remove(
    @Param('id') id: string,
    @Query('force') force?: string,
  ): Promise<ApiResponse<{ deletedParticipations: number; deletedClaims: number }>> {
    const result = await this.companiesService.remove(id, force === 'true');
    return { success: true, data: result };
  }
}
