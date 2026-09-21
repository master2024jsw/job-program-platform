import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { DocumentTypeDef, RequiredDocumentsDef } from '@job-program/shared';

const resourcesDir = path.join(process.cwd(), 'resources');

@Injectable()
export class RequiredDocumentsService {
  private readonly logger = new Logger(RequiredDocumentsService.name);
  private readonly documentTypes: DocumentTypeDef[];
  /** typeCode별 필수서류 정의. 같은 typeCode 파일이 여러 개면 guidelineYear가 큰 쪽을 채택한다. */
  private readonly requiredDocumentsByTypeCode = new Map<string, RequiredDocumentsDef>();

  constructor() {
    this.documentTypes = this.loadDocumentTypes();
    this.loadRequiredDocuments();
  }

  private loadDocumentTypes(): DocumentTypeDef[] {
    const filePath = path.join(resourcesDir, 'document-types.json');
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      this.logger.error(`서류유형 코드 파일을 읽지 못했습니다(${filePath}): ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  private loadRequiredDocuments(): void {
    const dir = path.join(resourcesDir, 'required-documents');
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch (error) {
      this.logger.error(`필수서류 디렉터리를 읽지 못했습니다(${dir}): ${error instanceof Error ? error.message : error}`);
      return;
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const def: RequiredDocumentsDef = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const existing = this.requiredDocumentsByTypeCode.get(def.typeCode);
        if (!existing || def.guidelineYear > existing.guidelineYear) {
          this.requiredDocumentsByTypeCode.set(def.typeCode, def);
        }
      } catch (error) {
        this.logger.error(`필수서류 파일을 읽지 못했습니다(${filePath}): ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  getDocumentTypes(): DocumentTypeDef[] {
    return this.documentTypes;
  }

  getRequiredDocuments(typeCode: string): RequiredDocumentsDef | null {
    return this.requiredDocumentsByTypeCode.get(typeCode) ?? null;
  }
}
