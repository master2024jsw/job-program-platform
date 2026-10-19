import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  DocumentTypeCode,
  RequiredDocPresence,
  RuleResult,
  SubsidyLedgerFields,
  SubsidyRound,
  SubsidyValidationResult,
  WorkerSubsidyValidationResult,
  SubsidyValidationStatus,
  WorkerSubsidyAmount,
} from '@job-program/shared';
import { Document } from '../documents/document.entity';
import { effectiveDocumentData } from '../documents/document-data.util';
import { CompaniesService } from '../companies/companies.service';
import { BusinessesService } from '../businesses/businesses.service';
import { RequiredDocumentsService } from '../required-documents/required-documents.service';
import { WorkersService } from '../workers/workers.service';
import { SubsidyCalculation } from '../subsidy/subsidy-calculation.entity';
import { DomainValidationEngine } from './domain-validation.engine';
import { ValidationRulesService } from './validation-rules.service';
import { JudgmentHistoryService } from './judgment-history.service';
import { deriveSubsidyNextActions } from './next-actions';
import type { ExtractedByDocumentType } from '../../common/domain-validation-engine.interface';
import type { ApproveSubsidyDto } from './dto/approve-subsidy.dto';

const TARGET_SUBSIDY = 'SUBSIDY';

function toNum(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) || n === 0 ? null : n;
}

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
export class SubsidyValidationService {
  private readonly logger = new Logger(SubsidyValidationService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(SubsidyCalculation)
    private readonly subsidyCalcRepository: Repository<SubsidyCalculation>,
    private readonly companiesService: CompaniesService,
    private readonly businessesService: BusinessesService,
    private readonly requiredDocumentsService: RequiredDocumentsService,
    private readonly workersService: WorkersService,
    private readonly engine: DomainValidationEngine,
    private readonly rulesService: ValidationRulesService,
    private readonly judgmentHistoryService: JudgmentHistoryService,
  ) {}

  /**
   * 기업 지원금 신청 건 단위 검증 (6단계).
   * 기업 단위 규칙(R-301, R-305, R-308, R-309) + 근로자별 규칙(R-302~307) 2단계 실행.
   */
  async validateCompanySubsidy(
    businessId: string,
    companyId: string,
    persist = true,
  ): Promise<SubsidyValidationResult> {
    const business = await this.businessesService.findOne(businessId);
    const typeCode = business.typeCode;

    // 기업 단위 서류 (workerId IS NULL or workerId = companyId-scoped)
    const companyDocs = await this.documentsRepository.find({
      where: { businessId, companyId, workerId: IsNull() },
    });

    const companyByType: ExtractedByDocumentType = {};
    const presentTypes = new Set<DocumentTypeCode>();
    const analyzedTypes = new Set<DocumentTypeCode>();

    for (const doc of [...companyDocs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const code = doc.documentType as DocumentTypeCode | undefined;
      if (!code) continue;
      presentTypes.add(code);
      const data = normalizeExtracted(effectiveDocumentData(doc));
      if (data) {
        companyByType[code] = data;
        analyzedTypes.add(code);
      }
    }

    // COMPANY_CONTEXT 가상 서류 주입
    const company = await this.companiesService.findOne(companyId).catch(() => null);
    if (company) {
      const c = company as unknown as Record<string, unknown>;
      companyByType['COMPANY_CONTEXT' as DocumentTypeCode] = {
        companyName: company.name,
        businessRegistrationNumber: c['businessRegistrationNumber'] ?? null,
        representativeName: c['representativeName'] ?? null,
        phone: c['phone'] ?? null,
      };
    }

    // 규칙 원장 로드 (SUBSIDY)
    const ledger = this.rulesService.getLedger(typeCode, TARGET_SUBSIDY);

    // 기업 단위 규칙 실행
    const companyRuleResults: RuleResult[] = ledger
      ? this.engine.validateWithRules(ledger.companyRules ?? [], companyByType)
      : [];

    // 근로자 목록 조회 (해당 기업 + 사업)
    const workers = await this.workersService.findAll({ companyId, businessId });

    const workerSubsidies: WorkerSubsidyAmount[] = [];
    const allWorkerRuleResults: RuleResult[] = [];

    for (const worker of workers) {
      // 근로자별 서류 로드 (workerId 기준)
      const workerDocs = await this.documentsRepository.find({
        where: { businessId, workerId: worker.id },
      });

      // 기업 단위 서류 + 근로자 서류 합산
      const workerByType: ExtractedByDocumentType = { ...companyByType };
      for (const doc of [...workerDocs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        const code = doc.documentType as DocumentTypeCode | undefined;
        if (!code) continue;
        presentTypes.add(code);
        const data = normalizeExtracted(effectiveDocumentData(doc));
        if (data) {
          workerByType[code] = data;
          analyzedTypes.add(code);
        }
      }

      // 서류별 상이한 성명·주민번호 필드명을 표준 필드로 정규화 (R-302 crossCheck 등)
      //  name ← workerName/participantName/applicantName, residentNumber ← residentRegistrationNumber
      for (const code of Object.keys(workerByType) as DocumentTypeCode[]) {
        const d = workerByType[code];
        if (!d) continue;
        const nm = d.name ?? d.workerName ?? d.participantName ?? d.applicantName;
        const rrn = d.residentNumber ?? d.residentRegistrationNumber;
        workerByType[code] = {
          ...d,
          ...(nm != null && d.name == null ? { name: nm } : {}),
          ...(rrn != null && d.residentNumber == null ? { residentNumber: rrn } : {}),
        };
      }

      // SUBSIDY_CALCULATION entries에서 해당 근로자 항목만 필터 주입.
      // R-302 crossCheck가 SUBSIDY_CALCULATION.name을 직접 참조하므로 최상위 name도 세팅.
      const calcKey = 'SUBSIDY_CALCULATION' as DocumentTypeCode;
      const calcData = workerByType[calcKey];
      if (calcData) {
        const allEntries = (calcData.entries as Record<string, unknown>[] | undefined) ?? [];
        const workerEntries = allEntries.filter(
          (e) => String(e.name ?? '').replace(/\s/g, '') === worker.name.replace(/\s/g, ''),
        );
        const filtered = workerEntries.length ? workerEntries : allEntries;
        workerByType[calcKey] = {
          ...calcData,
          entries: filtered,
          name: (filtered[0] as Record<string, unknown> | undefined)?.name ?? worker.name,
        };
      }

      // WORKER_CONTEXT 가상 서류 주입
      workerByType['WORKER_CONTEXT' as DocumentTypeCode] = {
        name: worker.name,
        birthDate: worker.birthDate ?? null,
        jobTitle: worker.position ?? null,
      };

      // 근로자 단위 규칙 실행
      const workerRules = ledger
        ? this.engine.validateWithRules(ledger.workerRules ?? [], workerByType)
        : [];

      // 지원금 회차 산정 (SUBSIDY_CALCULATION entries → SubsidyRound 배열)
      const rounds = this.extractRounds(workerByType);
      const total = rounds.reduce((sum, r) => sum + r.calculatedAmount, 0);

      // SubsidyCalculation 행 저장 (회차별)
      if (persist && rounds.length > 0) {
        await this.upsertSubsidyCalculations(worker.id, businessId, rounds);
      }

      workerSubsidies.push({
        workerId: worker.id,
        workerName: worker.name,
        rounds,
        total,
        rules: workerRules,
      });
      allWorkerRuleResults.push(...workerRules);
    }

    // 서류 존재 확인 (SUBSIDY stage)
    const documents = this.requiredDocPresence(typeCode, presentTypes, analyzedTypes);

    const allRules = [...companyRuleResults, ...allWorkerRuleResults];
    const status = this.computeStatus(documents, allRules);

    const appData = companyByType['SUBSIDY_APPLICATION' as DocumentTypeCode] ?? {};
    const mapped: SubsidyLedgerFields = {
      totalAmount: toNum(appData.totalAmount),
      applicantCount: toNum(appData.applicantCount),
      workerSubsidies,
    };

    const result: SubsidyValidationResult = {
      companyId,
      businessId,
      status,
      documents,
      rules: allRules,
      mapped,
      judgedAt: new Date().toISOString(),
      // 판정을 '담당자가 다음에 할 일'로 번역한다 (근로자 검증과 같은 층).
      nextActions: deriveSubsidyNextActions({ documents, rules: allRules }),
    };

    if (persist && allRules.length > 0) {
      await this.judgmentHistoryService.record({
        businessId,
        targetType: TARGET_SUBSIDY,
        targetId: companyId,
        status,
        result: allRules,
        source: 'AI',
        corrected: false,
      });
    }

    return result;
  }

  /**
   * 근로자 1명 기준으로 지원금 검증 결과를 다시 묶는다.
   *
   * 왜 필요한가:
   * 지원금 서류는 기업이 한 번에 내지만, 담당자가 실제로 처리하는 단위는 **근로자 1명**이다
   * ("이 사람이 지원금을 받으려면 내가 뭘 해야 하나"). 기업 단위 결과만 보여주면
   * 여러 근로자의 지적이 뒤섞여서 누구 때문에 막혔는지 구분이 안 된다.
   *
   * 기업 공통 규칙(R-301·305·308·309 등)은 **모든 근로자를 같이 막으므로** 함께 보여준다.
   * 서류 미제출도 마찬가지로 기업 단위다.
   */
  async validateWorkerSubsidy(
    businessId: string,
    companyId: string,
    workerId: string,
  ): Promise<WorkerSubsidyValidationResult> {
    const full = await this.validateCompanySubsidy(businessId, companyId, false);

    const mine = full.mapped.workerSubsidies.find((w) => w.workerId === workerId);
    if (!mine) {
      throw new NotFoundException('이 기업의 지원금 산출내역에서 해당 근로자를 찾지 못했습니다.');
    }

    // 근로자 규칙 객체는 workerSubsidies[].rules 와 full.rules 가 같은 참조를 공유한다.
    // 그 집합을 빼면 남는 것이 기업 공통 규칙이다.
    const workerRuleRefs = new Set<RuleResult>();
    for (const ws of full.mapped.workerSubsidies) for (const r of ws.rules) workerRuleRefs.add(r);
    const companyRules = full.rules.filter((r) => !workerRuleRefs.has(r));

    const scopedRules = [...companyRules, ...mine.rules];
    const status = this.computeStatus(full.documents, scopedRules);

    return {
      workerId,
      workerName: mine.workerName,
      companyId,
      businessId,
      status,
      documents: full.documents,
      companyRules,
      workerRules: mine.rules,
      rounds: mine.rounds,
      total: mine.total,
      nextActions: deriveSubsidyNextActions({ documents: full.documents, rules: scopedRules }),
      judgedAt: full.judgedAt,
    };
  }

  /**
   * 담당자 승인: 재검증 후 HUMAN 이력 기록.
   */
  async approveSubsidy(dto: ApproveSubsidyDto): Promise<SubsidyValidationResult> {
    const result = await this.validateCompanySubsidy(dto.businessId, dto.companyId, true);
    await this.judgmentHistoryService.record({
      businessId: dto.businessId,
      targetType: TARGET_SUBSIDY,
      targetId: dto.companyId,
      status: result.status,
      result: result.rules,
      source: 'HUMAN',
      corrected: true,
    });
    this.logger.log(`지원금 승인(기업 ${dto.companyId}) — 상태: ${result.status}`);
    return result;
  }

  async history(companyId: string) {
    return this.judgmentHistoryService.findByTarget(TARGET_SUBSIDY, companyId);
  }

  assertBusinessId(businessId?: string): string {
    if (!businessId) throw new BadRequestException('businessId가 필요합니다.');
    return businessId;
  }

  // ── private helpers ──────────────────────────────────────────────

  private requiredDocPresence(
    typeCode: string,
    presentTypes: Set<DocumentTypeCode>,
    analyzedTypes: Set<DocumentTypeCode>,
  ): RequiredDocPresence[] {
    const def = this.requiredDocumentsService.getRequiredDocuments(typeCode);
    const stage = def?.stages.find((s) => s.target === TARGET_SUBSIDY);
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

  private computeStatus(documents: RequiredDocPresence[], rules: RuleResult[]): SubsidyValidationStatus {
    if (rules.some((r) => r.verdict === 'FAIL')) return 'RISK';
    if (documents.filter((d) => !d.optional).some((d) => !d.present || !d.analyzed)) return 'MISSING';
    if (rules.some((r) => r.verdict === 'NEEDS_REVIEW')) return 'NEEDS_REVIEW';
    return 'COMPLETE';
  }

  /** SUBSIDY_CALCULATION entries → SubsidyRound 배열 변환. */
  private extractRounds(byType: ExtractedByDocumentType): SubsidyRound[] {
    const calcData = byType['SUBSIDY_CALCULATION' as DocumentTypeCode];
    if (!calcData) return [];
    const entries = (calcData.entries as Record<string, unknown>[] | undefined) ?? [];
    const internMax = 400000;
    const hireMax = 500000;
    return entries.map((e, idx) => {
      const salary = Number(e.baseSalary ?? e.salary ?? 0);
      const typeStr = String(e.subsidyType ?? e.type ?? '').toLowerCase();
      const isHire = typeStr.includes('채용') || typeStr === 'hire';
      const maxAmt = isHire ? hireMax : internMax;
      const calculatedAmount = Math.min(Math.round(salary * 0.5), maxAmt);
      return {
        round: Number(e.round ?? idx + 1),
        periodLabel: String(e.periodLabel ?? e.month ?? ''),
        baseSalary: salary,
        calculatedAmount,
        subsidyType: isHire ? 'HIRE' : 'INTERN',
      } as SubsidyRound;
    });
  }

  /** SubsidyCalculation 테이블에 회차별 행 upsert (workerId + round 기준). */
  private async upsertSubsidyCalculations(
    workerId: string,
    businessId: string,
    rounds: SubsidyRound[],
  ): Promise<void> {
    for (const r of rounds) {
      const existing = await this.subsidyCalcRepository.findOne({
        where: { workerId, businessId, round: r.round },
      });
      if (existing) {
        existing.periodLabel = r.periodLabel;
        existing.baseSalary = r.baseSalary;
        existing.calculatedAmount = r.calculatedAmount;
        existing.subsidyType = r.subsidyType;
        await this.subsidyCalcRepository.save(existing);
      } else {
        const row = this.subsidyCalcRepository.create({
          workerId,
          businessId,
          periodLabel: r.periodLabel,
          workedDays: 0,
          baseSalary: r.baseSalary,
          dailyWage: 0,
          calculatedAmount: r.calculatedAmount,
          subsidyType: r.subsidyType,
          round: r.round,
        });
        await this.subsidyCalcRepository.save(row);
      }
    }
  }
}
