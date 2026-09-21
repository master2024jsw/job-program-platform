import { Controller, Get, Query } from '@nestjs/common';
import type { ApiResponse, DocumentTypeDef, RequiredDocumentsDef } from '@job-program/shared';
import { RequiredDocumentsService } from './required-documents.service';
import { Public } from '../auth/public.decorator';

/** 로그인 화면의 사업유형 드롭다운(B단계)이 "준비중" 여부를 판단할 때도 써야 해서 인증 없이 연다. */
@Public()
@Controller('required-documents')
export class RequiredDocumentsController {
  constructor(private readonly requiredDocumentsService: RequiredDocumentsService) {}

  @Get('document-types')
  documentTypes(): ApiResponse<DocumentTypeDef[]> {
    return { success: true, data: this.requiredDocumentsService.getDocumentTypes() };
  }

  @Get()
  findByTypeCode(@Query('typeCode') typeCode: string): ApiResponse<RequiredDocumentsDef | null> {
    return { success: true, data: this.requiredDocumentsService.getRequiredDocuments(typeCode) };
  }
}
