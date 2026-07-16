import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';
import { WorkersService } from './workers.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { Worker } from './worker.entity';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Post()
  async create(@Body() dto: CreateWorkerDto): Promise<ApiResponse<Worker>> {
    const worker = await this.workersService.create(dto);
    return { success: true, data: worker };
  }

  @Get()
  async findAll(
    @Query('keyword') keyword?: string,
    @Query('companyId') companyId?: string,
  ): Promise<ApiResponse<Worker[]>> {
    const workers = await this.workersService.findAll({ keyword, companyId });
    return { success: true, data: workers };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<Worker>> {
    const worker = await this.workersService.findOne(id);
    return { success: true, data: worker };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWorkerDto): Promise<ApiResponse<Worker>> {
    const worker = await this.workersService.update(id, dto);
    return { success: true, data: worker };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.workersService.remove(id);
    return { success: true };
  }
}
