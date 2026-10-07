import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CompanyStatus, DOCUMENT_TYPE_CODES, DocumentAnalysisStatus, type DocumentTypeCode } from '@job-program/shared';
import { buildExcelBuffer, type ExcelColumn } from '../../common/excel.util';
import { maskDeep } from '../../common/masking.util';
import { ValidationService } from '../validation/validation.service';
import { Document } from './document.entity';
import { Company } from '../companies/company.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Business } from '../businesses/business.entity';
import { Worker } from '../workers/worker.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AnalyzeDocumentDto } from './dto/analyze-document.dto';
import { GeminiService } from './gemini.service';
import { FileConversionService } from './file-conversion.service';
import { FileRouterService } from './file-router.service';

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
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessRepository: Repository<CompanyBusiness>,
    @InjectRepository(Business)
    private readonly businessesRepository: Repository<Business>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    private readonly geminiService: GeminiService,
    private readonly fileConversionService: FileConversionService,
    private readonly validationService: ValidationService,
    private readonly fileRouterService: FileRouterService,
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

    // ZIP: 내부 파일을 추출해 자식 Document로 등록하고 각각 분석
    if (this.fileConversionService.isZip(document.filePath)) {
      return this.analyzeZip(document, dto);
    }

    document.status = DocumentAnalysisStatus.ANALYZING;
    document.errorMessage = null;
    await this.documentsRepository.save(document);

    try {
      const pdfPath = await this.ensurePdf(document);

      // 마크다운이 있고 내용이 충분하면(100자↑) 텍스트로 전송, 스캔 PDF 등 텍스트가 빈약하면 PDF 바이너리 직접 전송
      let rawExtracted: Record<string, unknown>;
      const mdText = document.markdownPath ? await fs.readFile(document.markdownPath, 'utf-8') : '';
      if (mdText.replace(/\s/g, '').length >= 100) {
        rawExtracted = await this.geminiService.extractFromText(mdText, dto.prompt, document.documentType as DocumentTypeCode | null);
      } else {
        rawExtracted = await this.geminiService.extractFromPdf(pdfPath, dto.prompt, document.documentType as DocumentTypeCode | null);
      }

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

    let saved = await this.documentsRepository.save(document);
    await this.autoRegisterCompanyIfNew(saved);
    await this.runCompanyValidationIfApplicable(saved);

    if (saved.status === DocumentAnalysisStatus.ANALYZED) {
      try {
        saved = await this.fileRouterService.relocate(saved);
      } catch (routeErr) {
        // 파일 이동 실패는 분석 결과를 깨뜨리지 않는다 — 파일은 _inbox에 남음
        // eslint-disable-next-line no-console
        console.warn(`파일 이동 실패(id=${saved.id}): ${routeErr instanceof Error ? routeErr.message : routeErr}`);
      }
    }

    return saved;
  }

  /**
   * ZIP 파일을 추출해 내부 파일별 Document를 생성하고 각각 analyze()를 실행한다.
   * ZIP 원본 Document의 extractedData에 자식 Document ID 목록을 기록한다.
   */
  private async analyzeZip(document: Document, dto: AnalyzeDocumentDto): Promise<Document> {
    document.status = DocumentAnalysisStatus.ANALYZING;
    await this.documentsRepository.save(document);

    try {
      const extractDir = `${document.filePath}_extracted`;
      const extractedPaths = this.fileConversionService.extractZip(document.filePath, extractDir);

      const childIds: string[] = [];
      for (const filePath of extractedPaths) {
        let fileSize = 0;
        try {
          const stats = await fs.stat(filePath);
          fileSize = stats.size;
        } catch {
          // 파일 크기 조회 실패 시 0으로 처리
        }
        const child = await this.createFromCollectedFile({
          fileName: path.basename(filePath),
          filePath,
          mimeType: 'application/octet-stream',
          fileSize,
          senderEmail: document.senderEmail ?? '',
          businessId: document.businessId,
          companyId: document.companyId,
          workerId: document.workerId,
        });
        if (!child) continue;
        childIds.push(child.id);
        try {
          await this.analyze(child.id, dto);
        } catch {
          // 개별 파일 분석 실패는 다른 파일 처리를 막지 않는다
        }
      }

      // 형제 파일 중 기업신청서 분석으로 companyId가 확정되면 나머지 형제에도 전파
      if (childIds.length > 1) {
        const childDocs = await Promise.all(childIds.map((id) => this.documentsRepository.findOne({ where: { id } })));
        const anchor = childDocs.find((d) => d?.companyId);
        if (anchor?.companyId) {
          for (const sibling of childDocs) {
            if (sibling && !sibling.companyId) {
              sibling.companyId = anchor.companyId;
              sibling.businessId = sibling.businessId ?? anchor.businessId;
              await this.documentsRepository.save(sibling);
            }
          }
        }
      }

      document.extractedData = { zip: true, extractedDocumentIds: childIds, fileCount: extractedPaths.length };
      document.status = DocumentAnalysisStatus.ANALYZED;
      document.analyzedAt = new Date();
    } catch (error) {
      document.status = DocumentAnalysisStatus.FAILED;
      document.errorMessage = error instanceof Error ? error.message : String(error);
    }

    return this.documentsRepository.save(document);
  }

  /**
   * COMPANY_APPLICATION 분석 완료 후 기업이 DB에 없으면 추출값으로 자동 등록한다.
   * 기관에 사업이 정확히 1개면 CompanyBusiness도 함께 생성한다.
   * 실패해도 분석 결과를 깨뜨리지 않는다.
   */
  private async autoRegisterCompanyIfNew(document: Document): Promise<void> {
    if (document.status !== DocumentAnalysisStatus.ANALYZED) return;
    if (document.documentType !== 'COMPANY_APPLICATION') return;
    if (document.companyId) return; // 이미 기업 연결됨

    const data = document.extractedData as Record<string, unknown> | null;
    if (!data) return;

    const rawBrn = data.businessRegistrationNumber;
    const rawName = data.companyName;
    if (typeof rawName !== 'string' || !rawName.trim()) return;

    const brn = typeof rawBrn === 'string' ? rawBrn.trim() : null;
    const name = rawName.trim();

    try {
      // 사업자번호로 기존 기업 찾기, 없으면 기업명으로 재시도
      let company = brn
        ? await this.companiesRepository.findOne({ where: { businessRegistrationNumber: brn } })
        : null;
      if (!company && !brn) {
        company = await this.companiesRepository.findOne({ where: { name } });
      }

      if (!company) {
        company = await this.companiesRepository.save(
          this.companiesRepository.create({
            name,
            businessRegistrationNumber: brn ?? undefined,
            representativeName: typeof data.representativeName === 'string' ? data.representativeName : undefined,
            phone: typeof data.phone === 'string' ? data.phone : undefined,
            email: typeof data.email === 'string' ? data.email : undefined,
            status: CompanyStatus.ACTIVE,
            source: 'api',
          }),
        );
        this.logger.log(`기업 자동 등록: ${company.name} (id=${company.id})`);
      }

      // 기관에 사업이 1개뿐이면 CompanyBusiness 자동 생성
      const businesses = await this.businessesRepository.find();
      if (businesses.length === 1) {
        const businessId = businesses[0].id;
        const existing = await this.companyBusinessRepository.findOne({
          where: { companyId: company.id, businessId },
        });
        if (!existing) {
          await this.companyBusinessRepository.save(
            this.companyBusinessRepository.create({ companyId: company.id, businessId }),
          );
        }
      }

      // 문서에 기업 연결
      document.companyId = company.id;
      if (!document.businessId && businesses.length === 1) {
        document.businessId = businesses[0].id;
      }
      await this.documentsRepository.save(document);
    } catch (error) {
      this.logger.error(`기업 자동 등록 실패(docId=${document.id}): ${error instanceof Error ? error.message : error}`);
    }
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

  /**
   * HWP/이미지/DOCX 등 비-PDF 원본을 PDF로 변환한다.
   * PDF 확보 후 Markdown도 추출해 AI 분석용으로 저장한다.
   */
  private async ensurePdf(document: Document): Promise<string> {
    let pdfPath: string;

    if (document.convertedFilePath) {
      pdfPath = document.convertedFilePath;
    } else if (!this.fileConversionService.needsConversion(document.filePath)) {
      pdfPath = document.filePath;
    } else {
      const { pdfPath: convertedPath, markdownText } = await this.fileConversionService.convertToPdf(document.filePath);
      document.convertedFilePath = convertedPath;
      await this.documentsRepository.save(document);
      pdfPath = convertedPath;

      // DOCX mammoth 폴백: Word 없이 추출한 텍스트를 MD로 직접 저장 (PDF→MD 추출 불필요)
      if (markdownText && !document.markdownPath) {
        const mdPath = `${convertedPath}.md`;
        await fs.writeFile(mdPath, markdownText, 'utf-8');
        document.markdownPath = mdPath;
        await this.documentsRepository.save(document);
      }
    }

    await this.ensureMarkdown(document, pdfPath);
    return pdfPath;
  }

  /** PDF에서 Markdown 텍스트를 추출해 .md 파일로 저장한다. 실패해도 분석을 중단하지 않는다. */
  private async ensureMarkdown(document: Document, pdfPath: string): Promise<void> {
    if (document.markdownPath) return;
    try {
      const mdText = await this.fileConversionService.extractMarkdown(pdfPath);
      const mdPath = `${pdfPath}.md`;
      await fs.writeFile(mdPath, mdText, 'utf-8');
      document.markdownPath = mdPath;
      await this.documentsRepository.save(document);
    } catch {
      // Markdown 추출 실패는 경고만 — PDF 직접 전송으로 폴백됨
    }
  }

  async createFromCollectedFile(params: {
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
    senderEmail: string;
    imapMessageId?: string | null;
    businessId?: string | null;
    companyId?: string | null;
    workerId?: string | null;
  }): Promise<Document | null> {
    // 같은 메일(Message-ID + 파일명)이 이미 수집된 경우 건너뜀
    if (params.imapMessageId) {
      const existing = await this.documentsRepository.findOne({
        where: { imapMessageId: params.imapMessageId, fileName: params.fileName },
      });
      if (existing) return null;
    }

    const document = this.documentsRepository.create({
      businessId: params.businessId,
      fileName: params.fileName,
      filePath: params.filePath,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      senderEmail: params.senderEmail,
      imapMessageId: params.imapMessageId,
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
    // 파일 삭제 실패가 DB 레코드 삭제를 막지 않도록 각각 방어적으로 처리
    const filesToDelete = [document.filePath, document.convertedFilePath, document.markdownPath].filter(Boolean) as string[];
    for (const filePath of filesToDelete) {
      try {
        await fs.rm(filePath, { force: true });
      } catch (err) {
        this.logger.warn(`파일 삭제 실패(path=${filePath}): ${err instanceof Error ? err.message : err}`);
      }
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
