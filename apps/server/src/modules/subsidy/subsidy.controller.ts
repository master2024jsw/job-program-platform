import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import {
  SubsidyService,
  type SubsidyEligibilityRow,
  type SubsidyPendingRow,
  type SubsidyCalculationRow,
} from './subsidy.service';
import { SubsidySetting } from './subsidy-setting.entity';
import { UpdateSubsidySettingsDto } from './dto/update-subsidy-settings.dto';
import { CreateSubsidyCalculationDto } from './dto/create-subsidy-calculation.dto';
import { SendGuidanceDto } from './dto/send-guidance.dto';

@Controller('subsidy')
export class SubsidyController {
  constructor(private readonly subsidyService: SubsidyService) {}

  @Get('settings')
  async getSettings(@Query('businessId') businessId: string): Promise<ApiResponse<SubsidySetting>> {
    const settings = await this.subsidyService.getSettings(businessId);
    return { success: true, data: settings };
  }

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSubsidySettingsDto): Promise<ApiResponse<SubsidySetting>> {
    const settings = await this.subsidyService.updateSettings(dto.businessId, dto.eligibilityMonths);
    return { success: true, data: settings };
  }

  @Post('guidance/send')
  async sendGuidance(
    @Body() dto: SendGuidanceDto,
  ): Promise<ApiResponse<Awaited<ReturnType<SubsidyService['sendGuidance']>>>> {
    const data = await this.subsidyService.sendGuidance(dto.businessId, dto.templateId, dto.workerIds);
    return { success: true, data };
  }

  @Get('eligibility')
  async listEligibility(@Query('businessId') businessId: string): Promise<ApiResponse<SubsidyEligibilityRow[]>> {
    const rows = await this.subsidyService.listEligibility(businessId);
    return { success: true, data: rows };
  }

  /** 아직 안내 대상이 아닌 근로자와 그 이유 — 화면에서 사라지지 않게 따로 내려준다. */
  @Get('eligibility/pending')
  async listPendingEligibility(
    @Query('businessId') businessId: string,
  ): Promise<ApiResponse<SubsidyPendingRow[]>> {
    const rows = await this.subsidyService.listPendingEligibility(businessId);
    return { success: true, data: rows };
  }

  @Post('calculations')
  async calculate(@Body() dto: CreateSubsidyCalculationDto): Promise<ApiResponse<SubsidyCalculationRow>> {
    const row = await this.subsidyService.calculate(dto);
    return { success: true, data: row };
  }

  @Get('calculations')
  async listCalculations(
    @Query('businessId') businessId?: string,
    @Query('workerId') workerId?: string,
  ): Promise<ApiResponse<SubsidyCalculationRow[]>> {
    const rows = await this.subsidyService.listCalculations({ businessId, workerId });
    return { success: true, data: rows };
  }

  @Delete('calculations/:id')
  async removeCalculation(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.subsidyService.removeCalculation(id);
    return { success: true };
  }
}
