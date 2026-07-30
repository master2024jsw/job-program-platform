import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { DocumentAnalysisStatus } from '@job-program/shared';
import { buildExcelBuffer, type ExcelColumn } from '../../common/excel.util';
import { Document } from './document.entity';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AnalyzeDocumentDto } from './dto/analyze-document.dto';
import { GeminiService } from './gemini.service';
import { FileConversionService } from './file-conversion.service';

const STATUS_LABEL: Record<DocumentAnalysisStatus, string> = {
  [DocumentAnalysisStatus.PENDING]: '대기',
  [DocumentAnalysisStatus.ANALYZING]: '분석중',
  [DocumentAnalysisStatus.ANALYZED]: '분석완료',
  [DocumentAnalysisStatus.FAILED]: '실패',
  [DocumentAnalysisStatus.REVIEWED]: '검토완료',
};

const REPORT_COLUMNS: ExcelColumn[] = [
  { header: '기업명', key: 'companyName', width: 22 },
  { header: '사업자등록번호', key: 'businessRegistrationNumber', width: 18 },
  { header: '근로자명', key: 'workerName', width: 14 },
  { header: '문서종류', key: 'documentType', width: 16 },
  { header: '파일명', key: 'fileName', width: 24 },
  { header: '출처', key: 'source', width: 12 },
  { header: '상태', key: 'status', width: 10 },
  { header: '미비여부', key: 'hasMissingItems', width: 10 },
  { header: '미비항목', key: 'missingItems', width: 36 },
  { header: '추출/검토 결과(JSON)', key: 'extractedSummary', width: 50 },
  { header: '등록일', key: 'createdAt', width: 14 },
  { header: '분석일', key: 'analyzedAt', width: 14 },
];

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    private readonly geminiService: GeminiService,
    private readonly fileConversionService: FileConversionService,
  ) {}

  async create(file: Express.Multer.File, dto: CreateDocumentDto): Promise<Document> {
    const document = this.documentsRepository.create({
      fileName: file.originalname,
      filePath: file.path,
      mimeType: file.mimetype,
      fileSize: file.size,
      documentType: dto.documentType,
      companyId: dto.companyId,
      workerId: dto.workerId,
      source: 'UPLOAD',
      status: DocumentAnalysisStatus.PENDING,
    });
    return this.documentsRepository.save(document);
  }

  findAll(filters?: { companyId?: string; workerId?: string; status?: DocumentAnalysisStatus }): Promise<Document[]> {
    return this.documentsRepository.find({
      where: {
        ...(filters?.companyId && { companyId: filters.companyId }),
        ...(filters?.workerId && { workerId: filters.workerId }),
        ...(filters?.status && { status: filters.status }),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Document> {
    const document = await this.documentsRepository.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException(`문서(${id})를 찾을 수 없습니다.`);
    }
    return document;
  }

  async analyze(id: string, dto: AnalyzeDocumentDto): Promise<Document> {
    const document = await this.findOne(id);
    document.status = DocumentAnalysisStatus.ANALYZING;
    document.errorMessage = null;
    await this.documentsRepository.save(document);

    try {
      const pdfPath = await this.ensurePdf(document);
      const extractedData = await this.geminiService.extractFromPdf(pdfPath, dto.prompt);
      document.extractedData = extractedData;
      document.status = DocumentAnalysisStatus.ANALYZED;
      document.analyzedAt = new Date();
    } catch (error) {
      document.status = DocumentAnalysisStatus.FAILED;
      document.errorMessage = error instanceof Error ? error.message : String(error);
    }

    return this.documentsRepository.save(document);
  }

  /** HWP/이미지 등 비-PDF 원본을 PDF로 변환해서 경로를 돌려준다. 이미 PDF면 원본 경로 그대로. */
  private async ensurePdf(document: Document): Promise<string> {
    if (document.convertedFilePath) {
      return document.convertedFilePath;
    }
    if (!this.fileConversionService.needsConversion(document.filePath)) {
      return document.filePath;
    }
    const convertedPath = await this.fileConversionService.convertToPdf(document.filePath);
    document.convertedFilePath = convertedPath;
    await this.documentsRepository.save(document);
    return convertedPath;
  }

  async createFromCollectedFile(params: {
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
    senderEmail: string;
    companyId?: string | null;
    workerId?: string | null;
  }): Promise<Document> {
    const document = this.documentsRepository.create({
      fileName: params.fileName,
      filePath: params.filePath,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      senderEmail: params.senderEmail,
      companyId: params.companyId,
      workerId: params.workerId,
      source: 'IMAP',
      status: DocumentAnalysisStatus.PENDING,
    });
    return this.documentsRepository.save(document);
  }

  async update(id: string, dto: UpdateDocumentDto): Promise<Document> {
    const document = await this.findOne(id);
    Object.assign(document, dto);
    return this.documentsRepository.save(document);
  }

  async remove(id: string): Promise<void> {
    const document = await this.findOne(id);
    await fs.rm(document.filePath, { force: true });
    if (document.convertedFilePath) {
      await fs.rm(document.convertedFilePath, { force: true });
    }
    await this.documentsRepository.remove(document);
  }

  async exportReport(): Promise<Buffer> {
    const [documents, companies, workers] = await Promise.all([
      this.documentsRepository.find({ order: { companyId: 'ASC', workerId: 'ASC', createdAt: 'ASC' } }),
      this.companiesRepository.find(),
      this.workersRepository.find(),
    ]);
    const companyMap = new Map(companies.map((c) => [c.id, c]));
    const workerMap = new Map(workers.map((w) => [w.id, w]));

    const rows = documents.map((doc) => {
      const company = doc.companyId ? companyMap.get(doc.companyId) : undefined;
      const worker = doc.workerId ? workerMap.get(doc.workerId) : undefined;
      const data = (doc.reviewedData ?? doc.extractedData) as Record<string, unknown> | null;
      const missingItems = Array.isArray(data?.missingItems) ? (data!.missingItems as unknown[]).map(String) : [];

      return {
        companyName: company?.name ?? '',
        businessRegistrationNumber: company?.businessRegistrationNumber ?? '',
        workerName: worker?.name ?? '',
        documentType: doc.documentType ?? '',
        fileName: doc.fileName,
        source: doc.source === 'IMAP' ? '메일수집' : '직접업로드',
        status: STATUS_LABEL[doc.status] ?? doc.status,
        hasMissingItems: missingItems.length > 0 ? '있음' : '없음',
        missingItems: missingItems.join(' / '),
        extractedSummary: data ? JSON.stringify(data) : '',
        createdAt: doc.createdAt.toISOString().slice(0, 10),
        analyzedAt: doc.analyzedAt ? doc.analyzedAt.toISOString().slice(0, 10) : '',
      };
    });

    return buildExcelBuffer('AI검토보고서', REPORT_COLUMNS, rows);
  }
}
