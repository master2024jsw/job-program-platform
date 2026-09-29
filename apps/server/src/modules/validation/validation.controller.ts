import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { ApiResponse, CompanyValidationResult, JudgmentHistoryRecord } from '@job-program/shared';
import { ValidationService } from './validation.service';
import { ApproveCompanyDto } from './dto/approve-company.dto';
import type { JudgmentHistory } from './judgment-history.entity';

@Controller('validation')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  /** 기업 신청 검증 결과 조회(재실행). businessId는 BusinessAccessGuard가 권한 검증. */
  @Get('company/:companyId')
  async validateCompany(
    @Param('companyId') companyId: string,
    @Query('businessId') businessId: string,
  ): Promise<ApiResponse<CompanyValidationResult>> {
    const bid = this.validationService.assertBusinessId(businessId);
    const data = await this.validationService.validateCompany(bid, companyId, false);
    return { success: true, data };
  }

  /** 담당자 승인 → 대장 반영 + 정정 이력. */
  @Post('company/:companyId/approve')
  async approveCompany(
    @Param('companyId') companyId: string,
    @Body() dto: ApproveCompanyDto,
  ): Promise<ApiResponse<CompanyValidationResult>> {
    const data = await this.validationService.approveCompany(dto.businessId, companyId, dto.reviewed);
    return { success: true, data };
  }

  @Get('company/:companyId/history')
  async history(@Param('companyId') companyId: string): Promise<ApiResponse<JudgmentHistoryRecord[]>> {
    const rows = (await this.validationService.history(companyId)) as unknown as JudgmentHistory[];
    const data: JudgmentHistoryRecord[] = rows.map((h) => ({
      id: h.id,
      businessId: h.businessId,
      targetType: h.targetType,
      targetId: h.targetId,
      status: h.status,
      rules: h.result,
      source: h.source,
      corrected: h.corrected,
      judgedAt: h.judgedAt.toISOString(),
    }));
    return { success: true, data };
  }
}
