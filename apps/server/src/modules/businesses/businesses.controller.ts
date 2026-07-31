import { Body, Controller, Get, Post } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import type { SessionUser } from '@job-program/shared';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { Business } from './business.entity';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get()
  async findAll(@CurrentUser() user: SessionUser): Promise<ApiResponse<Business[]>> {
    const data = await this.businessesService.listForUser(user.institutionId, user.id, user.role);
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateBusinessDto, @CurrentUser() user: SessionUser): Promise<ApiResponse<Business>> {
    const business = await this.businessesService.create(user.institutionId, dto);
    await this.businessesService.assignUser(user.id, business.id);
    return { success: true, data: business };
  }
}
