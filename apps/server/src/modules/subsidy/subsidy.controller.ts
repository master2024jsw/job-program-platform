import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { SubsidyService, type SubsidyEligibilityRow, type SubsidyCalculationRow } from './subsidy.service';
import { SubsidySetting } from './subsidy-setting.entity';
import { UpdateSubsidySettingsDto } from './dto/update-subsidy-settings.dto';
import { CreateSubsidyCalculationDto } from './dto/create-subsidy-calculation.dto';

@Controller('subsidy')
export class SubsidyController {
  constructor(private readonly subsidyService: SubsidyService) {}

  @Get('settings')
  async getSettings(): Promise<ApiResponse<SubsidySetting>> {
    const settings = await this.subsidyService.getSettings();
    return { success: true, data: settings };
  }

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSubsidySettingsDto): Promise<ApiResponse<SubsidySetting>> {
    const settings = await this.subsidyService.updateSettings(dto.eligibilityMonths);
    return { success: true, data: settings };
  }

  @Get('eligibility')
  async listEligibility(): Promise<ApiResponse<SubsidyEligibilityRow[]>> {
    const rows = await this.subsidyService.listEligibility();
    return { success: true, data: rows };
  }

  @Post('calculations')
  async calculate(@Body() dto: CreateSubsidyCalculationDto): Promise<ApiResponse<SubsidyCalculationRow>> {
    const row = await this.subsidyService.calculate(dto);
    return { success: true, data: row };
  }

  @Get('calculations')
  async listCalculations(@Query('workerId') workerId?: string): Promise<ApiResponse<SubsidyCalculationRow[]>> {
    const rows = await this.subsidyService.listCalculations(workerId);
    return { success: true, data: rows };
  }

  @Delete('calculations/:id')
  async removeCalculation(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.subsidyService.removeCalculation(id);
    return { success: true };
  }
}
