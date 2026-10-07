import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { BusinessesService } from '../businesses/businesses.service';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';
import { Document } from './document.entity';
import {
  resolveFolder,
  resolveConflict,
  sanitizeName,
  type FolderMapping,
  type PathContext,
} from './document-path.util';

const MAPPING_PATH = path.join(process.cwd(), 'resources', 'document-folder-mapping.json');
const PATH_WARN_THRESHOLD = 240;

@Injectable()
export class FileRouterService {
  private readonly logger = new Logger(FileRouterService.name);
  private readonly mapping: FolderMapping;
  private readonly dataDir: string;

  constructor(
    private readonly businessesService: BusinessesService,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
  ) {
    this.mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf-8')) as FolderMapping;
    this.dataDir = path.join(process.cwd(), 'data');
  }

  async relocate(document: Document): Promise<Document> {
    const ctx = await this.buildContext(document);
    const { dir, baseName, originalDir } = resolveFolder(ctx, this.mapping);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const testPathLen = path.join(dir, `${baseName}.pdf`).length;
    if (testPathLen > PATH_WARN_THRESHOLD) {
      this.logger.warn(`경로 길이 경고(${testPathLen}자): ${path.join(dir, `${baseName}.pdf`)}`);
    }

    const sourcePdf = document.convertedFilePath || document.filePath;
    const existingInDir = this.listFilenames(dir);
    const destPdf = resolveConflict(path.join(dir, `${baseName}.pdf`), existingInDir, today);

    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(sourcePdf, destPdf);

    if (document.convertedFilePath) {
      // 원본 비-PDF 파일을 _원본/ 폴더로 이동
      const origSrc = document.filePath;
      const origName = path.basename(origSrc);
      const existingInOrigDir = this.listFilenames(originalDir);
      const destOrig = resolveConflict(path.join(originalDir, origName), existingInOrigDir, today);
      await fsp.mkdir(originalDir, { recursive: true });
      await fsp.rename(origSrc, destOrig);
      document.filePath = destOrig;
      document.convertedFilePath = destPdf;
    } else {
      document.filePath = destPdf;
    }

    if (document.markdownPath) {
      try {
        const mdDest = `${destPdf}.md`;
        await fsp.rename(document.markdownPath, mdDest);
        document.markdownPath = mdDest;
      } catch {
        // md 이동 실패는 무시 — 재분석 시 재생성됨
      }
    }

    return this.documentsRepository.save(document);
  }

  private async buildContext(document: Document): Promise<PathContext> {
    const extracted = document.extractedData as Record<string, unknown> | null;

    let businessName: string | null = null;
    if (document.businessId) {
      try {
        const biz = await this.businessesService.findOne(document.businessId);
        businessName = biz.name;
      } catch {
        businessName = null;
      }
    }

    let companyName: string | null = null;
    let companyBrn: string | null = null;
    if (document.companyId) {
      const company = await this.companiesRepository.findOne({ where: { id: document.companyId } });
      if (company) {
        companyName = company.name;
        companyBrn = company.businessRegistrationNumber ?? null;
      }
    }

    let workerName: string | null = null;
    let workerBirthDate: string | null = null;
    if (document.workerId) {
      const worker = await this.workersRepository.findOne({ where: { id: document.workerId } });
      if (worker) {
        workerName = worker.name;
        workerBirthDate = worker.birthDate ?? null;
      }
    }
    if (!workerName && extracted) {
      workerName = typeof extracted.name === 'string' ? extracted.name : null;
    }
    if (!workerBirthDate && extracted) {
      workerBirthDate = typeof extracted.birthDate === 'string' ? extracted.birthDate : null;
    }

    let subsidyType: string | null = null;
    if (extracted) {
      if (typeof extracted.subsidyType === 'string') {
        subsidyType = extracted.subsidyType;
      } else if (Array.isArray(extracted.entries) && extracted.entries.length > 0) {
        const first = extracted.entries[0] as Record<string, unknown>;
        if (typeof first?.subsidyType === 'string') subsidyType = first.subsidyType;
      }
    }

    const existingSubsidyFolderNames = this.findExistingSubsidyFolders(businessName, companyName, companyBrn, workerName);

    return {
      dataDir: this.dataDir,
      businessName,
      companyName,
      companyBrn,
      documentType: document.documentType ?? null,
      workerName,
      workerBirthDate,
      subsidyType,
      existingSubsidyFolderNames,
      originalFileName: document.fileName,
      senderEmail: document.senderEmail ?? null,
      isDirectUpload: document.source === 'UPLOAD',
    };
  }

  private findExistingSubsidyFolders(
    businessName: string | null,
    companyName: string | null,
    companyBrn: string | null,
    workerName: string | null,
  ): string[] {
    if (!companyName || !workerName) return [];
    const bizFolder = sanitizeName(businessName ?? '_사업미지정');
    const brnPart = companyBrn ? companyBrn.replace(/\D/g, '') || '번호미등록' : '번호미등록';
    const companyFolder = sanitizeName(`${companyName}_${brnPart}`);
    const subsidyStageDir = path.join(this.dataDir, bizFolder, companyFolder, '03_지원금신청');
    if (!fs.existsSync(subsidyStageDir)) return [];
    const prefix = sanitizeName(workerName) + '_';
    return fs
      .readdirSync(subsidyStageDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
      .map((d) => d.name);
  }

  private listFilenames(dir: string): Set<string> {
    if (!fs.existsSync(dir)) return new Set();
    return new Set(fs.readdirSync(dir));
  }
}
