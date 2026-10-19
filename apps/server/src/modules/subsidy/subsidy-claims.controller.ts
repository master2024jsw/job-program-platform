import { BadRequestException, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import type { ApiResponse, SessionUser } from '@job-program/shared';
import { SubsidyClaimsService } from './subsidy-claims.service';
import { SubsidyClaim } from './subsidy-claim.entity';
import type { CalcResult } from './general-type-calculator';
import { BusinessesService } from '../businesses/businesses.service';
import { CurrentUser } from '../auth/current-user.decorator';

const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * 지원금 신청 API — `기업 -> 근로자 -> 지원금` 계단의 마지막 칸.
 *
 * participations 와 같은 이유로 businessId 를 필수로 받고 직접 assertAccess 한다
 * (전역 BusinessAccessGuard 는 businessId 가 없으면 통과시킨다 — 설계서 F02).
 */
@Controller('subsidy-claims')
export class SubsidyClaimsController {
  constructor(
    private readonly claimsService: SubsidyClaimsService,
    private readonly businessesService: BusinessesService,
  ) {}

  private async assertBusiness(user: SessionUser, businessId: string | undefined): Promise<string> {
    if (!businessId) {
      throw new BadRequestException('businessId 가 필요합니다. 어느 사업의 지원금인지 지정하세요.');
    }
    await this.businessesService.assertAccess(user, businessId);
    return businessId;
  }

  private checkAsOf(asOfDate?: string): string | undefined {
    if (asOfDate && !DATE_RE.test(asOfDate)) {
      throw new BadRequestException('asOfDate 는 YYYY-MM-DD 형식이어야 합니다.');
    }
    return asOfDate;
  }

  /** 참여기록을 고르면 그 사람의 지원금 신청만 (participationId 생략 시 사업 전체) */
  @Get()
  async findAll(
    @CurrentUser() user: SessionUser,
    @Query('businessId') businessId: string | undefined,
    @Query('participationId') participationId: string | undefined,
  ): Promise<ApiResponse<SubsidyClaim[]>> {
    const bid = await this.assertBusiness(user, businessId);
    return { success: true, data: await this.claimsService.findAll(bid, participationId) };
  }

  /** 산정 미리보기 — 저장하지 않는다. 금액·판정·근거를 그대로 보여준다. */
  @Get('preview/:participationId')
  async preview(
    @CurrentUser() user: SessionUser,
    @Param('participationId') participationId: string,
    @Query('businessId') businessId: string | undefined,
    @Query('asOfDate') asOfDate: string | undefined,
  ): Promise<ApiResponse<CalcResult>> {
    const bid = await this.assertBusiness(user, businessId);
    const result = await this.claimsService.preview(bid, participationId, this.checkAsOf(asOfDate));
    return { success: true, data: result };
  }

  /** 산정 결과 중 PASS 인 회차를 신청 건으로 저장한다. */
  @Post('generate/:participationId')
  async generate(
    @CurrentUser() user: SessionUser,
    @Param('participationId') participationId: string,
    @Query('businessId') businessId: string | undefined,
    @Query('asOfDate') asOfDate: string | undefined,
  ): Promise<ApiResponse<Awaited<ReturnType<SubsidyClaimsService['generate']>>>> {
    const bid = await this.assertBusiness(user, businessId);
    const result = await this.claimsService.generate(bid, participationId, this.checkAsOf(asOfDate));
    return { success: true, data: result };
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Query('businessId') businessId: string | undefined,
  ): Promise<ApiResponse<null>> {
    const bid = await this.assertBusiness(user, businessId);
    await this.claimsService.remove(bid, id);
    return { success: true, data: null };
  }
}
