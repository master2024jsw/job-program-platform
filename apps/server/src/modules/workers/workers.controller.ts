import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ApiResponse } from '@job-program/shared';
import type { ImportSummary } from '../../common/excel.util';
import { WorkersService } from './workers.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { Worker } from './worker.entity';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get('export')
  async export(@Res() res: Response): Promise<void> {
    const buffer = await this.workersService.exportToExcel();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="workers.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File): Promise<ApiResponse<ImportSummary>> {
    if (!file) {
      throw new NotFoundException('업로드된 엑셀 파일이 없습니다.');
    }
    const summary = await this.workersService.importFromExcel(file.buffer);
    return { success: true, data: summary };
  }

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
