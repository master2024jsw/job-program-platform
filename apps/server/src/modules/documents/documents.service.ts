import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CompanyStatus, RecruitStatus, RECRUIT_STATUS_ORDER, DOCUMENT_TYPE_CODES, DocumentAnalysisStatus, Gender, WorkerStatus, type DocumentTypeCode } from '@job-program/shared';
import { buildExcelBuffer, type ExcelColumn } from '../../common/excel.util';
import { maskDeep } from '../../common/masking.util';
import { ValidationService } from '../validation/validation.service';
import { WorkerValidationService } from '../validation/worker-validation.service';
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

// ── 근로자 그룹핑 헬퍼 ──────────────────────────────────────────────────────

/** 이름 신뢰도 우선순위 — 높을수록 우선 */
const NAME_PRIORITY: Partial<Record<DocumentTypeCode, number>> = {
  RESIDENT_ABSTRACT: 10,           // 공식 주민등록 서류 (최우선)
  EMPLOYMENT_INSURANCE_HISTORY: 8, // 인쇄체
  LABOR_CONTRACT: 5,               // 인쇄체
  EDUCATION_LEDGER: 5,             // 인쇄체
  WORKER_APPLICATION: 1,           // 필기체 (최하)
};

/** extractedData에서 이름 추출 (서류 유형마다 필드명이 다름) */
function extractName(data: Record<string, unknown>): string | null {
  const raw = data.name ?? data.workerName ?? data.participantName;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** extractedData에서 생년월일 추출 (주민번호 앞6자리 파생 또는 birthDate 직접)
 *  "911128-*******" 처럼 뒤 7자리가 마스킹된 경우에도 앞 6자리(YYMMDD)로 파생한다.
 *  성별 자리(*) 없을 때 yy ≥ 50 이면 1900년대, 아니면 2000년대로 추정.
 */
function extractBirthDate(data: Record<string, unknown>): string | null {
  if (typeof data.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)) {
    return data.birthDate;
  }
  const raw = typeof data.residentNumber === 'string' ? data.residentNumber : '';
  if (!raw) return null;
  // 대시만 제거 (마스킹 문자 * # 등은 유지)
  const noDash = raw.replace(/-/g, '');
  const front = noDash.slice(0, 6);
  if (!/^\d{6}$/.test(front)) return null;
  const yy = front.slice(0, 2);
  const mm = front.slice(2, 4);
  const dd = front.slice(4, 6);
  // 7번째 자리(성별코드)로 세기 결정, 마스킹 시 연도로 추정
  const gd = noDash.length >= 7 ? noDash[6] : '';
  const century = ['1', '2'].includes(gd) ? '19'
    : ['3', '4'].includes(gd) ? '20'
    : parseInt(yy, 10) >= 50 ? '19' : '20';
  return `${century}${yy}-${mm}-${dd}`;
}

/** extractedData에서 성별 파생 (주민번호 7번째 자리 기준) */
function extractGender(data: Record<string, unknown>): { gender: Gender | null } {
  const rrn = typeof data.residentNumber === 'string' ? data.residentNumber.replace(/\D/g, '') : '';
  if (rrn.length >= 7) {
    const gd = rrn[6];
    if (['1', '3'].includes(gd)) return { gender: Gender.MALE };
    if (['2', '4'].includes(gd)) return { gender: Gender.FEMALE };
  }
  return { gender: null };
}

// ────────────────────────────────────────────────────────────────────────────

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
    private readonly workerValidationService: WorkerValidationService,
    private readonly fileRouterService: FileRouterService,
  ) {}

  /** 기업 적격(4단계) 검증 대상 서류유형 — 분석 완료 시 기업 신청 건 검증을 자동 실행한다. */
  private static readonly COMPANY_DOC_TYPES: DocumentTypeCode[] = [
    'COMPANY_APPLICATION',
    'OPERATION_PLAN',
    'WORKPLACE_INSURANCE',
    'BUSINESS_REGISTRATION',
  ];

  /** 근로자 적격(5단계) 검증 대상 서류유형 — 분석 완료 시 근로자 검증을 자동 실행한다. */
  private static readonly WORKER_DOC_TYPES: DocumentTypeCode[] = [
    'WORKER_APPLICATION',
    'PRIVACY_CONSENT',
    'RESIDENT_ABSTRACT',
    'EMPLOYMENT_INSURANCE_HISTORY',
    'ELIGIBILITY_CONFIRM',
    'LABOR_CONTRACT',
    'EDUCATION_LEDGER',
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
    await this.groupWorkerDocuments(saved);
    await this.runWorkerValidationIfApplicable(saved);

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
   * 합본 PDF를 Gemini로 분석해 포함된 서류별 자식 Document를 생성한다.
   * 원본 Document는 combined=true 메타데이터와 함께 ANALYZED 상태로 마킹된다.
   */
  async analyzeAsCombined(id: string, companyId?: string, businessId?: string): Promise<Document> {
    const document = await this.findOne(id);
    if (companyId) document.companyId = companyId;
    if (businessId) document.businessId = businessId;
    // businessId가 여전히 null이면 사업이 1개뿐인 경우 자동 지정
    if (!document.businessId) {
      const businesses = await this.businessesRepository.find();
      if (businesses.length === 1) document.businessId = businesses[0].id;
    }
    document.status = DocumentAnalysisStatus.ANALYZING;
    document.errorMessage = null;
    await this.documentsRepository.save(document);

    try {
      const pdfPath = await this.ensurePdf(document);
      const items = await this.geminiService.extractAllFromPdf(pdfPath);

      const childIds: string[] = [];
      for (const item of items) {
        if (item.documentType === 'OTHER' && Object.keys(item.extractedData).length === 0) continue;

        const validType = (DOCUMENT_TYPE_CODES as readonly string[]).includes(item.documentType)
          ? item.documentType
          : undefined;

        const masked = maskDeep({ ...item.extractedData, missingItems: item.missingItems });

        const child = this.documentsRepository.create({
          businessId: document.businessId,
          companyId: document.companyId,
          workerId: document.workerId,
          fileName: document.fileName,
          filePath: document.filePath,
          convertedFilePath: document.convertedFilePath,
          markdownPath: document.markdownPath,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          source: document.source,
          senderEmail: document.senderEmail,
          documentType: validType,
          extractedData: masked,
          status: DocumentAnalysisStatus.ANALYZED,
          analyzedAt: new Date(),
        });
        let saved = await this.documentsRepository.save(child);
        childIds.push(saved.id);

        await this.autoRegisterCompanyIfNew(saved);
        await this.runCompanyValidationIfApplicable(saved);
        await this.groupWorkerDocuments(saved);
        await this.runWorkerValidationIfApplicable(saved);

        // companyId가 훅에서 채워졌을 수 있으므로 최신 상태 재조회
        const fresh = await this.documentsRepository.findOne({ where: { id: saved.id } });
        if (fresh) saved = fresh;
        try {
          await this.fileRouterService.relocate(saved);
        } catch {
          // 이동 실패는 무시
        }
      }

      // 형제 문서 간 companyId 전파 (기업신청서로 기업 확정된 경우)
      if (childIds.length > 1) {
        const childDocs = await Promise.all(childIds.map((cid) => this.documentsRepository.findOne({ where: { id: cid } })));
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

      document.extractedData = { combined: true, childDocumentIds: childIds, detectedCount: items.length };
      document.status = DocumentAnalysisStatus.ANALYZED;
      document.analyzedAt = new Date();
    } catch (error) {
      document.status = DocumentAnalysisStatus.FAILED;
      document.errorMessage = error instanceof Error ? error.message : String(error);
    }

    return this.documentsRepository.save(document);
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
    if (document.companyId && document.businessId) return; // 이미 기업·사업 모두 연결됨

    const data = document.extractedData as Record<string, unknown> | null;

    try {
      const businesses = await this.businessesRepository.find();

      // companyId는 있지만 businessId가 없는 경우: businessId만 채운다
      if (document.companyId && !document.businessId) {
        if (businesses.length === 1) {
          document.businessId = businesses[0].id;
          await this.documentsRepository.save(document);
        } else {
          // 해당 기업에 연결된 CompanyBusiness에서 businessId 찾기
          const cb = await this.companyBusinessRepository.findOne({ where: { companyId: document.companyId } });
          if (cb) {
            document.businessId = cb.businessId;
            await this.documentsRepository.save(document);
          }
        }
        return;
      }

      if (!data) return;
      const rawBrn = data.businessRegistrationNumber;
      const rawName = data.companyName;
      if (typeof rawName !== 'string' || !rawName.trim()) return;

      const brn = typeof rawBrn === 'string' ? rawBrn.trim() : null;
      const name = rawName.trim();

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

      // 기업신청서 접수 → recruitStatus APPLIED 상향 (역행 금지)
      const current = company.recruitStatus ?? RecruitStatus.PROSPECT;
      if (RECRUIT_STATUS_ORDER[RecruitStatus.APPLIED] > RECRUIT_STATUS_ORDER[current]) {
        company.recruitStatus = RecruitStatus.APPLIED;
        await this.companiesRepository.save(company);
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
   * WORKER_APPLICATION 분석 완료 후 근로자가 DB에 없으면 추출값으로 자동 등록한다.
   * companyId 컨텍스트(IMAP 발신자 매칭 또는 담당자 지정)가 반드시 있어야 한다.
   * 기업명 문자열 매칭 금지 — companyId가 없으면 등록하지 않는다.
   */
  /**
   * 근로자 서류 그룹핑 (변경2~5).
   * - 트리거: 어떤 근로자 서류 유형이든 ANALYZED 되면 실행
   * - 그룹 키: companyId + birthDate (주민번호 앞6자리 파생)
   * - 매칭: companyId + birthDate 로만 기존 Worker 검색 (이름은 OCR 오류 가능)
   * - 이름 확정: 신뢰도 우선순위 (초본 > 고용보험 > 계약서·교육 > 신청서)
   * - 미배정: 생년월일 미추출 → workerId = null 유지, 로그만 남김
   */
  private async groupWorkerDocuments(document: Document): Promise<void> {
    if (document.status !== DocumentAnalysisStatus.ANALYZED) return;
    if (!document.companyId) return;
    const workerDocTypes = new Set<string>(DocumentsService.WORKER_DOC_TYPES);
    if (!document.documentType || !workerDocTypes.has(document.documentType)) return;

    const data = document.extractedData as Record<string, unknown> | null;
    if (!data) return;

    // 이 서류에서 생년월일 추출 (주민번호 앞6 또는 birthDate 직접)
    const birthDate = extractBirthDate(data);
    const extractedRrn = typeof data.residentNumber === 'string' ? data.residentNumber : null;
    this.logger.log(
      `[그룹핑] docId=${document.id} type=${document.documentType} ` +
      `residentNumber=${extractedRrn ?? '(없음)'} birthDate=${birthDate ?? '(없음)'} ` +
      `groupKey=${birthDate ? `${document.companyId}+${birthDate}` : 'N/A'}`,
    );

    if (!birthDate) {
      // 생년월일 미추출 → 성명+companyId 폴백 (적격확인서 등 주민번호 없는 서류)
      await this.absorbByName(document, data);
      return;
    }

    // dangling workerId 감지: 연결된 근로자가 실제로 DB에 없는 경우
    let danglingId: string | null = null;
    if (document.workerId) {
      const exists = await this.workersRepository.findOne({ where: { id: document.workerId } });
      if (!exists) {
        danglingId = document.workerId;
        // QueryBuilder로 null 설정 (TypeORM update null 미적용 이슈 우회)
        await this.documentsRepository
          .createQueryBuilder()
          .update()
          .set({ workerId: () => 'NULL' })
          .where('company_id = :cid AND worker_id = :wid', { cid: document.companyId, wid: danglingId })
          .execute();
        document.workerId = null;
      } else {
        // 유효한 Worker에 이미 연결됨 → 이름 재계산만 수행
        await this.recalcWorkerName(exists, document.companyId);
        return;
      }
    }

    try {
      // companyId + birthDate 로 기존 Worker 조회 (이름 불일치 무관)
      let worker = await this.workersRepository.findOne({
        where: { companyId: document.companyId, birthDate },
      });

      if (!worker) {
        // 신규 Worker 생성: 이름은 일단 이 서류에서 얻을 수 있는 것으로, 나중에 재계산
        const tempName = extractName(data) ?? '(미확정)';
        const { gender } = extractGender(data);
        const newWorker = new Worker();
        newWorker.name = tempName;
        newWorker.birthDate = birthDate;
        newWorker.companyId = document.companyId;
        newWorker.businessId = document.businessId ?? null;
        newWorker.status = WorkerStatus.ACTIVE;
        if (gender) newWorker.gender = gender;
        if (typeof data.phone === 'string' && data.phone) newWorker.phone = data.phone;
        worker = await this.workersRepository.save(newWorker);
        this.logger.log(`근로자 자동 등록: birthDate=${birthDate} (id=${worker.id}, companyId=${document.companyId})`);
      }

      // 이 문서에 workerId 연결
      document.workerId = worker.id;
      await this.documentsRepository.save(document);

      // 같은 companyId의 근로자 서류 중 workerId가 null이거나 dangling인 것을 생년월일로 backfill
      const candidates = await this.documentsRepository.find({
        where: danglingId
          ? [
              { companyId: document.companyId, workerId: IsNull() },
              { companyId: document.companyId, workerId: danglingId },
            ]
          : { companyId: document.companyId, workerId: IsNull() },
      });

      const toBackfill: Document[] = [];
      for (const c of candidates) {
        if (c.id === document.id) continue;
        if (!c.documentType || !workerDocTypes.has(c.documentType)) continue;
        const d = c.extractedData as Record<string, unknown> | null;
        if (!d) continue;
        if (extractBirthDate(d) === birthDate) toBackfill.push(c);
      }

      if (toBackfill.length > 0) {
        await this.documentsRepository.update(
          toBackfill.map((c) => c.id),
          { workerId: worker.id },
        );
        this.logger.log(`근로자 서류 backfill: workerId=${worker.id}, ${toBackfill.length}건`);
      }

      // 이름 재계산: 연결된 모든 서류에서 신뢰도 우선순위로 최적 이름 선택
      await this.recalcWorkerName(worker, document.companyId, [document, ...toBackfill]);
      // 생년월일 없는 미배정 서류를 Worker 이름으로 흡수 (적격확인서 등)
      await this.absorbUnassignedByWorkerName(worker, document.companyId);
    } catch (error) {
      this.logger.error(`근로자 그룹핑 실패(docId=${document.id}): ${error instanceof Error ? error.message : error}`);
    }
  }

  /** 동일 workerId가 붙은 모든 서류를 보고 신뢰도 우선순위로 Worker.name을 갱신한다. */
  private async recalcWorkerName(worker: Worker, companyId: string, extraDocs?: Document[]): Promise<void> {
    const linked = await this.documentsRepository.find({ where: { companyId, workerId: worker.id } });
    const allDocs = [...linked, ...(extraDocs ?? [])];
    // 중복 제거
    const seen = new Set<string>();
    const unique = allDocs.filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });

    let bestName: string | null = null;
    let bestPriority = -1;
    for (const doc of unique) {
      const priority = NAME_PRIORITY[doc.documentType as DocumentTypeCode] ?? 0;
      if (priority <= bestPriority) continue;
      const d = doc.extractedData as Record<string, unknown> | null;
      const name = d ? extractName(d) : null;
      if (name) { bestName = name; bestPriority = priority; }
    }

    if (bestName && bestName !== worker.name) {
      await this.workersRepository.update(worker.id, { name: bestName });
      this.logger.log(`근로자 이름 확정: "${worker.name}" → "${bestName}" (우선순위=${bestPriority})`);
      worker.name = bestName;
    }
  }

  /**
   * 생년월일을 추출할 수 없는 서류(적격확인서 등)를 성명+companyId로 기존 Worker에 연결한다.
   * 호출 시점: groupWorkerDocuments 에서 birthDate 미추출 즉시.
   */
  private async absorbByName(document: Document, data: Record<string, unknown>): Promise<void> {
    const name = extractName(data);
    if (!name) {
      this.logger.warn(`근로자 서류 미배정(생년월일·성명 미추출): docId=${document.id}, type=${document.documentType}`);
      return;
    }
    if (!document.companyId) return;
    const worker = await this.workersRepository.findOne({
      where: { companyId: document.companyId, name },
    });
    if (worker) {
      document.workerId = worker.id;
      await this.documentsRepository.save(document);
      this.logger.log(`성명 폴백 흡수: name="${name}" → workerId=${worker.id} (docId=${document.id})`);
    } else {
      this.logger.warn(`근로자 서류 미배정(성명 "${name}" 매칭 Worker 없음): docId=${document.id}`);
    }
  }

  /**
   * birthDate 기반 그룹핑·이름 재계산 완료 후, 같은 companyId 내 미배정 서류 중
   * 생년월일 없는 것을 Worker.name 과 비교해 흡수한다.
   */
  private async absorbUnassignedByWorkerName(worker: Worker, companyId: string): Promise<void> {
    const workerDocTypes = new Set<string>(DocumentsService.WORKER_DOC_TYPES);
    const unassigned = await this.documentsRepository.find({
      where: { companyId, workerId: IsNull() },
    });
    const toAbsorb: Document[] = [];
    for (const doc of unassigned) {
      if (!doc.documentType || !workerDocTypes.has(doc.documentType)) continue;
      const d = doc.extractedData as Record<string, unknown> | null;
      if (!d) continue;
      if (extractBirthDate(d)) continue;       // birthDate 있는 건 기본 로직으로 처리
      const name = extractName(d);
      if (name && name === worker.name) toAbsorb.push(doc);
    }
    if (toAbsorb.length > 0) {
      await this.documentsRepository.update(toAbsorb.map((d) => d.id), { workerId: worker.id });
      this.logger.log(`성명 매칭 흡수(포스트): worker="${worker.name}" (${worker.id}), ${toAbsorb.length}건`);
    }
  }

  /**
   * 분석 완료된 문서가 근로자 적격 서류이고 근로자·기업·사업에 연결돼 있으면 근로자 검증을 자동 실행한다.
   */
  private async runWorkerValidationIfApplicable(document: Document): Promise<void> {
    if (document.status !== DocumentAnalysisStatus.ANALYZED) return;
    if (!document.businessId || !document.companyId || !document.workerId) return;
    if (!document.documentType || !DocumentsService.WORKER_DOC_TYPES.includes(document.documentType as DocumentTypeCode)) {
      return;
    }
    try {
      await this.workerValidationService.validateWorker(document.businessId, document.companyId, document.workerId, true);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`근로자 신청 검증 실패(workerId=${document.workerId}): ${error instanceof Error ? error.message : error}`);
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
