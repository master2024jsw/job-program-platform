import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { AnnouncementsService, type AnnouncementListFilters, type AnnouncementStatus, type JobAnnouncementRow } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { JobAnnouncement } from './announcement.entity';
import { MoelDaeguCollectorService, MoelCollectSummary } from './moel-daegu-collector.service';

@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly moelDaeguCollectorService: MoelDaeguCollectorService,
  ) {}

  @Post('collect/moel-daegu')
  async collectMoelDaegu(): Promise<ApiResponse<MoelCollectSummary>> {
    const summary = await this.moelDaeguCollectorService.collectByKeyword();
    return { success: true, data: summary };
  }

  @Post()
  async create(@Body() dto: CreateAnnouncementDto): Promise<ApiResponse<JobAnnouncement>> {
    const announcement = await this.announcementsService.create(dto);
    return { success: true, data: announcement };
  }

  @Get()
  async findAll(
    @Query('status') status?: AnnouncementStatus,
    @Query('sortBy') sortBy?: AnnouncementListFilters['sortBy'],
    @Query('sortOrder') sortOrder?: AnnouncementListFilters['sortOrder'],
    @Query('keyword') keyword?: string,
    @Query('bookmarkedOnly') bookmarkedOnly?: string,
  ): Promise<ApiResponse<JobAnnouncementRow[]>> {
    const data = await this.announcementsService.findAll({
      status,
      sortBy,
      sortOrder,
      keyword,
      bookmarkedOnly: bookmarkedOnly === 'true',
    });
    return { success: true, data };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ): Promise<ApiResponse<JobAnnouncement>> {
    const announcement = await this.announcementsService.update(id, dto);
    return { success: true, data: announcement };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.announcementsService.remove(id);
    return { success: true };
  }
}
