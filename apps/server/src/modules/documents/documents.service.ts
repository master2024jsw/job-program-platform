import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { DOCUMENT_TYPE_CODES, DocumentAnalysisStatus, type DocumentTypeCode } from '@job-program/shared';
import { buildExcelBuffer, type ExcelColumn } from '../../common/excel.util';
import { maskDeep } from '../../common/masking.util';
import { ValidationService } from '../validation/validation.service';
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
    private readonly validationService: ValidationService,
  ) {}

  /** 기업 적격(4단계) 검증 대상 서류유형 — 분석 완료 시 기업 신청 건 검증을 자동 실행한다. */
  private static readonly COMPANY_DOC_TYPES: DocumentTypeCode[] = [
    'COMPANY_APPLICATION',
    'OPERATION_PLAN',
    'WORKPLACE_INSURANCE',
    'BUSINESS_REGISTRATION',
  ];

  async create(file: Express.Multer.File, dto: CreateDocumentDto): Promise<Document> {
    const document = this.documentsRepository.create({
      businessId: dto.businessId,
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

  findAll(filters?: {
    businessId?: string;
    unassigned?: boolean;
    companyId?: string;
    workerId?: string;
    status?: DocumentAnalysisStatus;
  }): Promise<Document[]> {
    return this.documentsRepository.find({
      where: {
        ...(filters?.unassigned ? { businessId: IsNull() } : filters?.businessId ? { businessId: filters.businessId } : {}),
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
      const rawExtracted = await this.geminiService.extractFromPdf(pdfPath, dto.prompt);
      // 외부 AI가 돌려준 추출값을 저장하기 전에 주민번호를 마스킹한다(DB에 평문 미저장, 보안 안내문 준수).
      document.extractedData = maskDeep(rawExtracted);
      // 업로드 시 실무자가 직접 문서종류를 지정했으면 AI 판단으로 덮어쓰지 않는다.
      if (!document.documentType) {
        const aiDocumentType = rawExtracted.documentType;
        if (typeof aiDocumentType === 'string' && (DOCUMENT_TYPE_CODES as readonly string[]).includes(aiDocumentType)) {
          document.documentType = aiDocumentType;
        }
      }
      document.status = DocumentAnalysisStatus.ANALYZED;
      document.analyzedAt = new Date();
    } catch (error) {
      document.status = DocumentAnalysisStatus.FAILED;
      document.errorMessage = error instanceof Error ? error.message : String(error);
    }

    const saved = await this.documentsRepository.save(document);
    await this.runCompanyValidationIfApplicable(saved);
    return saved;
  }

  /**
   * 분석 완료된 문서가 기업 적격 서류이고 기업·사업에 연결돼 있으면 기업 신청 건 검증을 실행한다.
   * 검증 실패가 문서 분석 자체를 깨뜨리지 않도록 방어적으로 처리한다.
   */
  private async runCompanyValidationIfApplicable(document: Document): Promise<void> {
    if (document.status !== DocumentAnalysisStatus.ANALYZED) return;
    if (!document.businessId || !document.companyId) return;
    if (!document.documentType || !DocumentsService.COMPANY_DOC_TYPES.includes(document.documentType as DocumentTypeCode)) {
      return;
    }
    try {
      await this.validationService.validateCompany(document.businessId, document.companyId, true);
    } catch (error) {
      // 검증 실패는 로그만 남기고 문서 분석 결과는 유지한다.
      // eslint-disable-next-line no-console
      console.error(`기업 신청 검증 실패(companyId=${document.companyId}): ${error instanceof Error ? error.message : error}`);
    }
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
    businessId?: string | null;
    companyId?: string | null;
    workerId?: string | null;
  }): Promise<Document> {
    const document = this.documentsRepository.create({
      businessId: params.businessId,
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
