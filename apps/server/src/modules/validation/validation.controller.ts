import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { ApiResponse, CompanyValidationResult, JudgmentHistoryRecord, WorkerValidationResult } from '@job-program/shared';
import { ValidationService } from './validation.service';
import { WorkerValidationService } from './worker-validation.service';
import { ApproveCompanyDto } from './dto/approve-company.dto';
import { ApproveWorkerDto } from './dto/approve-worker.dto';
import type { JudgmentHistory } from './judgment-history.entity';

@Controller('validation')
export class ValidationController {
  constructor(
    private readonly validationService: ValidationService,
    private readonly workerValidationService: WorkerValidationService,
  ) {}

  // ── 기업 신청 (4단계) ──────────────────────────────────────────────

  /** 기업 신청 검증 결과 조회(재실행). */
  @Get('company/:companyId')
  async validateCompany(
    @Param('companyId') companyId: string,
    @Query('businessId') businessId: string,
  ): Promise<ApiResponse<CompanyValidationResult>> {
    const bid = this.validationService.assertBusinessId(businessId);
    const data = await this.validationService.validateCompany(bid, companyId, false);
    return { success: true, data };
  }

  /** 담당자 승인 → 기업 대장 반영 + 정정 이력. */
  @Post('company/:companyId/approve')
  async approveCompany(
    @Param('companyId') companyId: string,
    @Body() dto: ApproveCompanyDto,
  ): Promise<ApiResponse<CompanyValidationResult>> {
    const data = await this.validationService.approveCompany(dto.businessId, companyId, dto.reviewed);
    return { success: true, data };
  }

  @Get('company/:companyId/history')
  async companyHistory(@Param('companyId') companyId: string): Promise<ApiResponse<JudgmentHistoryRecord[]>> {
    return { success: true, data: await this.toHistoryRecords(this.validationService.history(companyId)) };
  }

  // ── 근로자 신청 (5단계) ────────────────────────────────────────────

  /** 근로자 신청 검증 결과 조회(재실행). companyId: 기업 컨텍스트(R-204/R-210 교차확인용). */
  @Get('worker/:workerId')
  async validateWorker(
    @Param('workerId') workerId: string,
    @Query('businessId') businessId: string,
    @Query('companyId') companyId: string,
  ): Promise<ApiResponse<WorkerValidationResult>> {
    const bid = this.workerValidationService.assertBusinessId(businessId);
    const data = await this.workerValidationService.validateWorker(bid, companyId, workerId, false);
    return { success: true, data };
  }

  /** 담당자 승인 → 근로자 대장 반영 + 정정 이력. */
  @Post('worker/:workerId/approve')
  async approveWorker(
    @Param('workerId') workerId: string,
    @Body() dto: ApproveWorkerDto,
  ): Promise<ApiResponse<WorkerValidationResult>> {
    const data = await this.workerValidationService.approveWorker(dto, workerId);
    return { success: true, data };
  }

  @Get('worker/:workerId/history')
  async workerHistory(@Param('workerId') workerId: string): Promise<ApiResponse<JudgmentHistoryRecord[]>> {
    return { success: true, data: await this.toHistoryRecords(this.workerValidationService.history(workerId)) };
  }

  // ── 공통 헬퍼 ─────────────────────────────────────────────────────

  private async toHistoryRecords(promise: Promise<JudgmentHistory[]>): Promise<JudgmentHistoryRecord[]> {
    const rows = await promise as unknown as JudgmentHistory[];
    return rows.map((h) => ({
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
  }
}
