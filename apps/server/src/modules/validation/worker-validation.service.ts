import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  DocumentTypeCode,
  RequiredDocPresence,
  RuleResult,
  WorkerLedgerFields,
  WorkerValidationResult,
  WorkerValidationStatus,
} from '@job-program/shared';
import { Gender } from '@job-program/shared';
import { Document } from '../documents/document.entity';
import { CompaniesService } from '../companies/companies.service';
import { BusinessesService } from '../businesses/businesses.service';
import { RequiredDocumentsService } from '../required-documents/required-documents.service';
import { WorkersService } from '../workers/workers.service';
import { CompanyBusiness } from '../companies/company-business.entity';
import { DomainValidationEngine } from './domain-validation.engine';
import { ValidationRulesService } from './validation-rules.service';
import { JudgmentHistoryService } from './judgment-history.service';
import type { ExtractedByDocumentType } from '../../common/domain-validation-engine.interface';
import type { ApproveWorkerDto } from './dto/approve-worker.dto';

const TARGET_WORKER = 'WORKER';

function toText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * 주민번호 앞 6자리에서 생년월일 파생 (YYYY-MM-DD).
 * 7번째 자리 1·3 → 1900·2000년대 남, 2·4 → 여.
 */
function parseResidentNumber(rrn: string): { birthDate: string | null; gender: string | null } {
  const digits = rrn.replace(/\D/g, '');
  if (digits.length < 7) return { birthDate: null, gender: null };
  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const gd = digits[6];
  const century = ['1', '2'].includes(gd) ? '19' : ['3', '4'].includes(gd) ? '20' : null;
  const birthDate = century ? `${century}${yy}-${mm}-${dd}` : null;
  const gender = ['1', '3'].includes(gd) ? '남' : ['2', '4'].includes(gd) ? '여' : null;
  return { birthDate, gender };
}

/** 주민번호 표시용 마스킹: YYMMDD-G###### */
function maskRrnForDisplay(rrn: string): string {
  const digits = rrn.replace(/\D/g, '');
  if (digits.length < 7) return rrn;
  return `${digits.slice(0, 6)}-${digits[6]}######`;
}

/**
 * AI가 한 파일에 여러 서류가 섞인 경우 배열로 반환하기도 한다.
 * 배열이면 원소들을 하나로 병합하고, 객체면 그대로 돌려준다.
 */
function normalizeExtracted(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const merged: Record<string, unknown> = {};
    for (const el of raw) {
      if (el && typeof el === 'object') Object.assign(merged, el as Record<string, unknown>);
    }
    return Object.keys(merged).length ? merged : null;
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

@Injectable()
export class WorkerValidationService {
  private readonly logger = new Logger(WorkerValidationService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessRepository: Repository<CompanyBusiness>,
    private readonly companiesService: CompaniesService,
    private readonly businessesService: BusinessesService,
    private readonly requiredDocumentsService: RequiredDocumentsService,
    private readonly workersService: WorkersService,
    private readonly engine: DomainValidationEngine,
    private readonly rulesService: ValidationRulesService,
    private readonly judgmentHistoryService: JudgmentHistoryService,
  ) {}

  /**
   * 근로자 1건을 검증한다 (workerId 기준 서류 그룹핑).
   * companyId는 기업 컨텍스트 주입 및 R-210 교차확인용 (기업↔근로자 연결 근거는 아님).
   */
  async validateWorker(
    businessId: string,
    companyId: string,
    workerId: string,
    persist = true,
  ): Promise<WorkerValidationResult> {
    const business = await this.businessesService.findOne(businessId);
    const typeCode = business.typeCode;

    const docs = await this.documentsRepository.find({ where: { businessId, workerId } });

    const byType: ExtractedByDocumentType = {};
    const analyzedTypes = new Set<DocumentTypeCode>();
    const presentTypes = new Set<DocumentTypeCode>();

    for (const doc of [...docs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const code = doc.documentType as DocumentTypeCode | undefined;
      if (!code) continue;
      presentTypes.add(code);
      const data = normalizeExtracted(doc.reviewedData ?? doc.extractedData);
      if (data) {
        byType[code] = data;
        analyzedTypes.add(code);
      }
    }

    // R-209 crossCheck용 성명 필드 정규화:
    // LABOR_CONTRACT.workerName, EDUCATION_LEDGER.participantName → name
    const lcKey = 'LABOR_CONTRACT' as DocumentTypeCode;
    const elKey = 'EDUCATION_LEDGER' as DocumentTypeCode;
    if (byType[lcKey]?.workerName) {
      byType[lcKey] = { ...byType[lcKey], name: byType[lcKey]!.workerName };
    }
    if (byType[elKey]?.participantName) {
      byType[elKey] = { ...byType[elKey], name: byType[elKey]!.participantName };
    }

    // 기업 컨텍스트 주입 (R-204 90일 이내 확인, R-210 기업 정보 대조)
    const company = await this.companiesService.findOne(companyId).catch(() => null);
    if (company) {
      byType['COMPANY_CONTEXT' as DocumentTypeCode] = {
        companyName: company.name,
        phone: company.phone ?? null,
        representativeName: company.representativeName ?? null,
      };
    }

    // STEP1: 서류 존재 확인 (필수5/선택2)
    const documents = this.requiredDocPresence(typeCode, presentTypes, analyzedTypes);

    // STEP3: 규칙 원장 로드 + 검증엔진 실행
    const ledger = this.rulesService.getLedger(typeCode, TARGET_WORKER);
    const rules: RuleResult[] = ledger ? this.engine.validateWithLedger(ledger, byType) : [];

    // STEP2: 대장 매핑값 도출
    const companyBusiness = await this.companyBusinessRepository
      .findOne({ where: { companyId, businessId } })
      .catch(() => null);
    const mapped = this.mapLedgerFields(byType, company, companyBusiness);

    const status = this.computeStatus(documents, rules);
    const result: WorkerValidationResult = {
      workerId,
      businessId,
      status,
      documents,
      rules,
      mapped,
      judgedAt: new Date().toISOString(),
    };

    if (persist && rules.length > 0) {
      await this.judgmentHistoryService.record({
        businessId,
        targetType: TARGET_WORKER,
        targetId: workerId,
        status,
        result: rules,
        source: 'AI',
        corrected: false,
      });
    }

    return result;
  }

  private requiredDocPresence(
    typeCode: string,
    presentTypes: Set<DocumentTypeCode>,
    analyzedTypes: Set<DocumentTypeCode>,
  ): RequiredDocPresence[] {
    const def = this.requiredDocumentsService.getRequiredDocuments(typeCode);
    const stage = def?.stages.find((s) => s.target === TARGET_WORKER);
    const typeDefs = this.requiredDocumentsService.getDocumentTypes();
    const labelOf = (code: string) => typeDefs.find((t) => t.code === code)?.label ?? code;
    if (!stage) return [];
    const optionalSet = new Set(stage.optional ?? []);
    return stage.documents.map((code) => ({
      documentType: code,
      label: labelOf(code),
      present: presentTypes.has(code),
      analyzed: analyzedTypes.has(code),
      optional: optionalSet.has(code),
    }));
  }

  private mapLedgerFields(
    byType: ExtractedByDocumentType,
    company: { name: string; email?: string | null } | null,
    cb: { participationType?: string | null } | null,
  ): WorkerLedgerFields {
    const app = byType['WORKER_APPLICATION' as DocumentTypeCode] ?? {};
    const contract = byType['LABOR_CONTRACT' as DocumentTypeCode] ?? {};
    const resident = byType['RESIDENT_ABSTRACT' as DocumentTypeCode] ?? {};

    // 성명: 초본(공식) 우선, 없으면 신청서
    const name = toText(resident.name ?? app.name);

    // 주민번호: 신청서 기준 (초본에도 있으나 신청서 값 사용)
    const rawRrn = toText(app.residentNumber);
    const { birthDate, gender } = rawRrn ? parseResidentNumber(rawRrn) : { birthDate: null, gender: null };
    const residentNumberMasked = rawRrn ? maskRrnForDisplay(rawRrn) : null;

    return {
      companyName: company?.name ?? null,
      phone: toText(app.phone),
      email: company?.email ?? null,
      participationType: cb?.participationType ?? null,
      name,
      residentNumberMasked,
      birthDate,
      gender,
      internStartDate: toText(contract.internStartDate),
      internEndDate: toText(contract.internEndDate),
      resignDate: null,
    };
  }

  private computeStatus(documents: RequiredDocPresence[], rules: RuleResult[]): WorkerValidationStatus {
    if (rules.some((r) => r.verdict === 'FAIL')) return 'RISK';
    // 필수서류(optional=false)가 하나라도 미제출·미분석이면 MISSING
    if (documents.filter((d) => !d.optional).some((d) => !d.present || !d.analyzed)) return 'MISSING';
    if (rules.some((r) => r.verdict === 'NEEDS_REVIEW')) return 'NEEDS_REVIEW';
    return 'COMPLETE';
  }

  /**
   * 담당자 승인 → Worker 대장 반영 + 정정 이력.
   */
  async approveWorker(dto: ApproveWorkerDto, workerId: string): Promise<WorkerValidationResult> {
    const worker = await this.workersService.findOne(workerId).catch(() => {
      throw new NotFoundException(`근로자(${workerId})를 찾을 수 없습니다.`);
    });

    const { reviewed } = dto;

    // Worker 기본정보 반영 (빈 값은 기존 유지)
    const patch: Record<string, unknown> = {};
    if (reviewed.name) patch.name = reviewed.name;
    if (reviewed.birthDate) patch.birthDate = reviewed.birthDate;
    if (reviewed.gender) patch.gender = reviewed.gender === '남' ? Gender.MALE : Gender.FEMALE;
    if (reviewed.phone) patch.phone = reviewed.phone;
    if (reviewed.internStartDate) patch.hireDate = reviewed.internStartDate;
    if (reviewed.internEndDate) patch.internEndDate = reviewed.internEndDate;

    if (Object.keys(patch).length > 0) {
      await this.workersService.update(workerId, patch as Parameters<typeof this.workersService.update>[1]);
    }

    // 승인 후 재검증 및 HUMAN 이력
    const result = await this.validateWorker(dto.businessId, dto.companyId, workerId, false);
    await this.judgmentHistoryService.record({
      businessId: dto.businessId,
      targetType: TARGET_WORKER,
      targetId: workerId,
      status: result.status,
      result: result.rules,
      source: 'HUMAN',
      corrected: true,
    });

    this.logger.log(`근로자(${worker.name}, ${workerId}) 승인 완료 — 상태: ${result.status}`);
    return result;
  }

  async history(workerId: string) {
    return this.judgmentHistoryService.findByTarget(TARGET_WORKER, workerId);
  }

  assertBusinessId(businessId?: string): string {
    if (!businessId) throw new BadRequestException('businessId가 필요합니다.');
    return businessId;
  }
}
