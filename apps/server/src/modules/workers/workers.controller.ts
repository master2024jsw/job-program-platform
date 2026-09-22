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
import type { ApiResponse, SessionUser } from '@job-program/shared';
import type { ImportSummary } from '../../common/excel.util';
import { WorkersService } from './workers.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { Worker } from './worker.entity';
import { BusinessesService } from '../businesses/businesses.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('workers')
export class WorkersController {
  constructor(
    private readonly workersService: WorkersService,
    private readonly businessesService: BusinessesService,
  ) {}

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
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Body('businessId') businessId: string | undefined,
    @CurrentUser() user: SessionUser,
  ): Promise<ApiResponse<ImportSummary>> {
    if (!file) {
      throw new NotFoundException('업로드된 엑셀 파일이 없습니다.');
    }
    // multipart 요청은 BusinessAccessGuard가 businessId를 볼 수 없는 시점에 실행되므로 여기서 직접 검증한다.
    if (businessId) {
      await this.businessesService.assertAccess(user, businessId);
    }
    const summary = await this.workersService.importFromExcel(file.buffer, businessId);
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
    @Query('businessId') businessId?: string,
  ): Promise<ApiResponse<Worker[]>> {
    const workers = await this.workersService.findAll({ keyword, companyId, businessId });
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
