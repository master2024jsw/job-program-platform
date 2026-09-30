import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CompanyLedgerFields,
  CompanyValidationResult,
  CompanyValidationStatus,
  DocumentTypeCode,
  RequiredDocPresence,
  RuleResult,
} from '@job-program/shared';
import { Document } from '../documents/document.entity';
import { CompaniesService } from '../companies/companies.service';
import { BusinessesService } from '../businesses/businesses.service';
import { RequiredDocumentsService } from '../required-documents/required-documents.service';
import { DomainValidationEngine } from './domain-validation.engine';
import { ValidationRulesService } from './validation-rules.service';
import { JobClassificationService } from './job-classification.service';
import { JudgmentHistoryService } from './judgment-history.service';
import type { ExtractedByDocumentType } from '../../common/domain-validation-engine.interface';

const TARGET_COMPANY = 'COMPANY';
const JOB_JUDGMENT_LABEL: Record<string, string> = {
  ELIGIBLE: '가능',
  EXCLUDED: '제외',
  NEEDS_REVIEW: '담당자확인',
};

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function normalizeBrn(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * AI가 한 파일에 여러 서류가 섞인 경우 배열로 반환하기도 한다. 배열이면 원소들을 하나로 병합하고,
 * 객체면 그대로, 그 외에는 null 을 돌려준다.
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
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly companiesService: CompaniesService,
    private readonly businessesService: BusinessesService,
    private readonly requiredDocumentsService: RequiredDocumentsService,
    private readonly engine: DomainValidationEngine,
    private readonly rulesService: ValidationRulesService,
    private readonly jobClassificationService: JobClassificationService,
    private readonly judgmentHistoryService: JudgmentHistoryService,
  ) {}

  /**
   * 한 기업의 신청 건을 검증한다 (companyId 기준 서류 그룹핑).
   * @param persist AI 판정 이력을 남길지 (analyze 자동호출=true, 단순 조회=false)
   */
  async validateCompany(
    businessId: string,
    companyId: string,
    persist = true,
  ): Promise<CompanyValidationResult> {
    const business = await this.businessesService.findOne(businessId);
    const typeCode = business.typeCode;

    const docs = await this.documentsRepository.find({ where: { businessId, companyId } });

    // 서류유형별 추출값(담당자 검토값 우선). 같은 유형 여러 건이면 가장 최근 것.
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

    // STEP1: 필수서류 존재 확인 (RequiredDocumentsModule 재사용)
    const documents = this.requiredDocPresence(typeCode, presentTypes, analyzedTypes);

    // STEP3: 규칙 원장 로드 + 검증엔진 실행
    const ledger = this.rulesService.getLedger(typeCode, TARGET_COMPANY);
    const rules: RuleResult[] = ledger ? this.engine.validateWithLedger(ledger, byType) : [];

    // STEP2: 대장 매핑값 도출
    const mapped = this.mapLedgerFields(byType);

    const status = this.computeStatus(documents, rules);
    const result: CompanyValidationResult = {
      companyId,
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
        targetType: TARGET_COMPANY,
        targetId: companyId,
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
    const stage = def?.stages.find((s) => s.target === TARGET_COMPANY);
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

  private mapLedgerFields(byType: ExtractedByDocumentType): CompanyLedgerFields {
    const app = byType.COMPANY_APPLICATION ?? {};
    const plan = byType.OPERATION_PLAN ?? {};
    const reg = byType.BUSINESS_REGISTRATION ?? {};

    const recruitJobCode = toText(app.recruitJobCode);
    const hit = this.jobClassificationService.lookup(recruitJobCode);
    const jobEligibility = hit ? JOB_JUDGMENT_LABEL[hit.judgment] ?? '담당자확인' : recruitJobCode ? '담당자확인' : null;

    const generalTypeCount = toNumber(plan.generalTypeCount);
    const intergenerationalTypeCount = toNumber(plan.intergenerationalTypeCount);
    let participationType: string | null = null;
    const g = generalTypeCount ?? 0;
    const i = intergenerationalTypeCount ?? 0;
    if (g > 0 && i > 0) participationType = '혼합형';
    else if (g > 0) participationType = '인턴형';
    else if (i > 0) participationType = '세대통합형';

    return {
      businessRegistrationNumber: normalizeBrn(app.businessRegistrationNumber ?? reg.businessRegistrationNumber),
      companyName: toText(app.companyName ?? reg.companyName),
      phone: toText(app.phone),
      email: toText(app.email),
      representativeName: toText(app.representativeName ?? reg.representativeName),
      generalTypeCount,
      intergenerationalTypeCount,
      plannedHeadcount: toNumber(plan.plannedHeadcount),
      recruitJobTitle: toText(app.recruitJobTitle),
      recruitJobCode,
      jobEligibility,
      participationType,
    };
  }

  private computeStatus(documents: RequiredDocPresence[], rules: RuleResult[]): CompanyValidationStatus {
    if (rules.some((r) => r.verdict === 'FAIL')) return 'RISK';
    if (!documents.every((d) => d.present && d.analyzed)) return 'MISSING';
    if (rules.some((r) => r.verdict === 'NEEDS_REVIEW')) return 'NEEDS_REVIEW';
    return 'COMPLETE';
  }

  /**
   * 담당자 승인 → 대장 반영 (Company/CompanyBusiness upsert, CompaniesModule 재사용) + 정정 이력.
   * reviewed 값은 담당자가 대조 화면에서 확정한 값이다.
   */
  async approveCompany(
    businessId: string,
    companyId: string,
    reviewed: Partial<CompanyLedgerFields>,
  ): Promise<CompanyValidationResult> {
    const company = await this.companiesService.findOne(companyId).catch(() => null);
    if (!company) throw new NotFoundException(`기업(${companyId})을 찾을 수 없습니다.`);

    // Company 기본정보 반영 (빈 값은 기존 유지)
    await this.companiesService.update(companyId, {
      ...(reviewed.companyName ? { name: reviewed.companyName } : {}),
      ...(reviewed.businessRegistrationNumber ? { businessRegistrationNumber: reviewed.businessRegistrationNumber } : {}),
      ...(reviewed.representativeName ? { representativeName: reviewed.representativeName } : {}),
      ...(reviewed.phone ? { phone: reviewed.phone } : {}),
      ...(reviewed.email ? { email: reviewed.email } : {}),
    });

    // CompanyBusiness(사업별 진행상태) 반영
    await this.companiesService.upsertCompanyBusiness(companyId, {
      businessId,
      participationType: reviewed.participationType ?? undefined,
      plannedHeadcount: reviewed.plannedHeadcount ?? undefined,
      generalTypeHeadcount: reviewed.generalTypeCount ?? undefined,
      intergenerationalTypeHeadcount: reviewed.intergenerationalTypeCount ?? undefined,
      recruitJobTitle: reviewed.recruitJobTitle ?? undefined,
      recruitJobCode: reviewed.recruitJobCode ?? undefined,
      jobEligibility: reviewed.jobEligibility ?? undefined,
    });

    // 승인 후 재검증 (정정된 값 반영) 및 사람 정정 이력 축적
    const result = await this.validateCompany(businessId, companyId, false);
    await this.judgmentHistoryService.record({
      businessId,
      targetType: TARGET_COMPANY,
      targetId: companyId,
      status: result.status,
      result: result.rules,
      source: 'HUMAN',
      corrected: true,
    });
    return result;
  }

  async history(companyId: string) {
    return this.judgmentHistoryService.findByTarget(TARGET_COMPANY, companyId);
  }

  assertBusinessId(businessId?: string): string {
    if (!businessId) throw new BadRequestException('businessId가 필요합니다.');
    return businessId;
  }
}
