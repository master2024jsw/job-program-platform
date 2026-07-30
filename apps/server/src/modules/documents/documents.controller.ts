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
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { ApiResponse } from '@job-program/shared';
import { DocumentAnalysisStatus } from '@job-program/shared';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AnalyzeDocumentDto } from './dto/analyze-document.dto';
import { Document } from './document.entity';

const uploadDir = path.join(process.cwd(), 'data', 'uploads');

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
  ): Promise<ApiResponse<Document>> {
    if (!file) {
      throw new NotFoundException('업로드된 파일이 없습니다.');
    }
    const document = await this.documentsService.create(file, dto);
    return { success: true, data: document };
  }

  @Get()
  async findAll(
    @Query('companyId') companyId?: string,
    @Query('workerId') workerId?: string,
    @Query('status') status?: DocumentAnalysisStatus,
  ): Promise<ApiResponse<Document[]>> {
    const documents = await this.documentsService.findAll({ companyId, workerId, status });
    return { success: true, data: documents };
  }

  @Get('report/export')
  async exportReport(@Res() res: Response): Promise<void> {
    const buffer = await this.documentsService.exportReport();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ai-review-report.xlsx"',
    });
    res.send(buffer);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<Document>> {
    const document = await this.documentsService.findOne(id);
    return { success: true, data: document };
  }

  @Post(':id/analyze')
  async analyze(@Param('id') id: string, @Body() dto: AnalyzeDocumentDto): Promise<ApiResponse<Document>> {
    const document = await this.documentsService.analyze(id, dto);
    return { success: true, data: document };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDocumentDto): Promise<ApiResponse<Document>> {
    const document = await this.documentsService.update(id, dto);
    return { success: true, data: document };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.documentsService.remove(id);
    return { success: true };
  }
}
