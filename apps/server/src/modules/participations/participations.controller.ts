import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ApiResponse, Participation as ParticipationDto, ParticipationWithNames, SessionUser } from '@job-program/shared';
import { ParticipationsService } from './participations.service';
import { CreateParticipationDto } from './dto/create-participation.dto';
import { UpdateParticipationDto } from './dto/update-participation.dto';
import { BusinessesService } from '../businesses/businesses.service';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * 근로자의 사업참여 API.
 *
 * 모든 라우트가 businessId 를 필수로 받고, 컨트롤러에서 직접 assertAccess 를 호출한다.
 * 전역 BusinessAccessGuard 는 businessId 가 없으면 그냥 통과시키므로(설계서 F02)
 * 그것만 믿지 않는다.
 */
@Controller('participations')
export class ParticipationsController {
  constructor(
    private readonly participationsService: ParticipationsService,
    private readonly businessesService: BusinessesService,
  ) {}

  private async assertBusiness(user: SessionUser, businessId: string | undefined): Promise<string> {
    if (!businessId) {
      throw new BadRequestException('businessId 가 필요합니다. 어느 사업의 참여기록인지 지정하세요.');
    }
    await this.businessesService.assertAccess(user, businessId);
    return businessId;
  }

  /** 기업을 고르면 그 기업의 근로자만 (companyId 생략 시 사업 전체) */
  @Get()
  async findAll(
    @CurrentUser() user: SessionUser,
    @Query('businessId') businessId: string | undefined,
    @Query('companyId') companyId: string | undefined,
  ): Promise<ApiResponse<ParticipationWithNames[]>> {
    const bid = await this.assertBusiness(user, businessId);
    return { success: true, data: await this.participationsService.findAll(bid, companyId) };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Query('businessId') businessId: string | undefined,
  ): Promise<ApiResponse<ParticipationDto>> {
    const bid = await this.assertBusiness(user, businessId);
    const found = await this.participationsService.findOne(bid, id);
    return { success: true, data: found as unknown as ParticipationDto };
  }

  @Post()
  async create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateParticipationDto,
  ): Promise<ApiResponse<ParticipationDto>> {
    await this.assertBusiness(user, dto.businessId);
    const saved = await this.participationsService.create(dto);
    return { success: true, data: saved as unknown as ParticipationDto };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Query('businessId') businessId: string | undefined,
    @Body() dto: UpdateParticipationDto,
  ): Promise<ApiResponse<ParticipationDto>> {
    const bid = await this.assertBusiness(user, businessId);
    const saved = await this.participationsService.update(bid, id, dto);
    return { success: true, data: saved as unknown as ParticipationDto };
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Query('businessId') businessId: string | undefined,
  ): Promise<ApiResponse<null>> {
    const bid = await this.assertBusiness(user, businessId);
    await this.participationsService.remove(bid, id);
    // 기존 클라이언트가 204 를 처리하지 못하므로 success:true 형식을 유지한다 (설계서 §13.1, F-J15).
    return { success: true, data: null };
  }
}
