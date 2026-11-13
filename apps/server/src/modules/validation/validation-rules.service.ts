import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { DocumentTypeCode, RuleSource, RuleVerdict, ValidationRuleType } from '@job-program/shared';

const resourcesDir = path.join(process.cwd(), 'resources');

/**
 * exceptionRule 조건 1건.
 * equal/similar 는 documents 의 같은 field 를 비교하고,
 * exists/notExists 는 document 하나의 field 가 채워져 있는지만 본다.
 */
export interface ExceptionCondition {
  /** 생략 시 documents 로 비교. exists/notExists/containsAny 에서는 이 서류를 본다. */
  document?: DocumentTypeCode;
  field: string;
  match: 'equal' | 'similar' | 'exists' | 'notExists' | 'containsAny';
  /** equal/similar: 비교 대상 서류 (2개 이상). */
  documents?: DocumentTypeCode[];
  /**
   * containsAny: 이 중 하나라도 값에 포함되면 참 (공백 제거·소문자 비교).
   * 지침에 규정이 없어 키워드로밖에 잡을 수 없는 항목(업종·주소 등)에 쓴다.
   * 키워드는 단서일 뿐이므로 이 조건만으로 판정하지 않고 담당자 확인으로 넘긴다.
   */
  keywords?: string[];
}

/** riskFlag multiDocumentChecks 항목 1건. */
export interface MultiDocCheck {
  document: DocumentTypeCode;
  fields: string[];
  fieldLabels?: Record<string, string>;
  expectedBoolean?: boolean;
  expected?: string;
}

/** 규칙 원장 한 건 (validation-rules/*.json). 유형별로 파라미터 형태가 다르다. */
export interface RuleDef {
  id: string;
  type: ValidationRuleType;
  label: string;
  // 선택서류 skipIfMissing: 나열된 서류 중 하나라도 없으면 이 규칙을 PASS로 스킵 (선택서류 규칙에 사용)
  skipIfMissing?: DocumentTypeCode[];
  // crossCheck
  field?: string;
  documents?: DocumentTypeCode[];
  /** crossCheck 전용: 있으면 포함, 없으면 건너뜀 */
  optionalDocuments?: DocumentTypeCode[];
  normalize?: 'brn' | 'companyName';
  /** crossCheck 전용: 서류마다 다른 필드명을 쓸 때. { "SUBSIDY_APPLICATION": "bankAccount" } 처럼 지정하면 해당 서류에서만 그 필드를 읽는다. */
  fieldMap?: Partial<Record<string, string>>;
  onMismatch?: RuleVerdict;
  // riskFlag
  document?: DocumentTypeCode;
  fields?: string[];
  fieldLabels?: Record<string, string>;
  expected?: string;
  expectedBoolean?: boolean;
  /** riskFlag 여러 서류 동시 확인 (R-206) */
  multiDocumentChecks?: MultiDocCheck[];
  onFail?: RuleVerdict;
  // calcRule (R-104 직종판정 / 5단계 날짜·기간 규칙 / 6단계 지원금 규칙)
  calcType?:
    | 'jobClassification'
    | 'internPeriodCheck'
    | 'dateCompare'
    | 'employmentHistoryDateCheck'
    | 'recentWorkplaceCheck'
    | 'ageCheck'
    // 6단계 지원금 calcType
    | 'subsidyCalc'
    | 'subsidyTotalCheck'
    | 'subsidyTypeCheck'
    | 'insuranceRosterCheck'
    | 'salaryCompare'
    | 'salaryTransferCheck';
  // ageCheck (R-200 만연령 확인)
  minAge?: number;
  ageField?: string;
  codeField?: string;
  titleField?: string;
  lookup?: string;
  verdictMap?: Record<string, RuleVerdict>;
  eligibilityLabelMap?: Record<string, string>;
  onMissing?: RuleVerdict;
  // calcRule 날짜 공통: 기준 날짜(앵커)
  anchorDocument?: DocumentTypeCode;
  anchorField?: string;
  // internPeriodCheck (R-205)
  startField?: string;
  endField?: string;
  internKeywordField?: string;
  monthsMin?: number;
  monthsMax?: number;
  // dateCompare (R-208)
  dateField?: string;
  dateRelation?: 'before' | 'onOrAfter';
  // employmentHistoryDateCheck / recentWorkplaceCheck (R-203, R-204)
  workplacesField?: string;
  lossDateField?: string;
  startDateField?: string;
  companyNameField?: string;
  daysThreshold?: number;
  // 6단계 지원금 calcType 공통
  entriesField?: string;
  amountField?: string;
  totalField?: string;
  salaryField?: string;
  typeField?: string;
  periodField?: string;
  anchorEndField?: string;
  internMaxAmount?: number;
  hireMaxAmount?: number;
  transferField?: string;
  netPayField?: string;
  toleranceAmount?: number;

  // ── exceptionRule 전용 (심사③ 예외처리 축적 구조) ──────────────────
  /** 어떤 기본 규칙이 어떤 판정일 때 이 예외를 따져보나. verdicts 기본값 ['NEEDS_REVIEW','FAIL']. */
  appliesWhen?: { failedRule: string; verdicts?: RuleVerdict[] };
  /** 모두 만족해야 예외로 본다. */
  conditions?: ExceptionCondition[];
  /** 예외 인정에 필요한 추가 서류. PASS 로 내리려면 반드시 있어야 한다. */
  requiresDocument?: DocumentTypeCode;
  /** 예외에 해당할 때의 판정. 기본 NEEDS_REVIEW (자동 통과 금지 — ADR-07). */
  onMatch?: RuleVerdict;
  /** 담당자 안내 문장. */
  guidance?: string;
  /** 출처·등록자·등록일 (심사③). */
  source?: RuleSource;
  /** 1부터. 규칙을 고치면 올리고, 이전 내용은 git 이력으로 보존한다. */
  version?: number;
}

export interface RuleLedger {
  typeCode: string;
  target: 'COMPANY' | 'WORKER' | 'SUBSIDY';
  guidelineYear: number;
  source: string;
  documentFields: Partial<Record<DocumentTypeCode, string[]>>;
  /** COMPANY/WORKER 원장: 단일 규칙 목록 */
  rules?: RuleDef[];
  /** SUBSIDY 원장: 기업 단위 규칙 */
  companyRules?: RuleDef[];
  /** SUBSIDY 원장: 참여자(근로자) 단위 규칙 */
  workerRules?: RuleDef[];
  /** COMPANY/WORKER 원장: 예외 규칙 (기본 규칙 실행 후 평가). */
  exceptionRules?: RuleDef[];
  /** SUBSIDY 원장: 기업 단위 예외 규칙. */
  companyExceptionRules?: RuleDef[];
  /** SUBSIDY 원장: 근로자 단위 예외 규칙. */
  workerExceptionRules?: RuleDef[];
}

/**
 * 검증 규칙 원장 로더. `validation-rules/{typeCode}-{target}.json` 을 읽어 캐시한다.
 * 규칙을 코드에 두지 않고 데이터로 관리(REQ3) — S2(검증규칙 관리)에서 이후 파일만 수정.
 */
@Injectable()
export class ValidationRulesService {
  private readonly logger = new Logger(ValidationRulesService.name);
  /** key = `${typeCode}:${target}` */
  private readonly ledgers = new Map<string, RuleLedger>();

  constructor() {
    this.load();
  }

  private load(): void {
    const dir = path.join(resourcesDir, 'validation-rules');
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch (error) {
      this.logger.error(`검증규칙 디렉터리 로드 실패(${dir}): ${error instanceof Error ? error.message : error}`);
      return;
    }
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const ledger = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RuleLedger;
        this.sanitizeExceptionRules(ledger, file);
        this.ledgers.set(`${ledger.typeCode}:${ledger.target}`, ledger);
      } catch (error) {
        this.logger.error(`검증규칙 파일 로드 실패(${filePath}): ${error instanceof Error ? error.message : error}`);
      }
    }
    this.logger.log(`검증규칙 원장 ${this.ledgers.size}건 로드`);
  }

  /**
   * 예외 규칙 원장 검사. 오기입한 규칙 하나가 전체 판정을 깨지 않도록,
   * 잘못된 건만 경고 로그를 남기고 제외한다.
   *   - type 이 exceptionRule 이 아님
   *   - appliesWhen.failedRule 이 같은 원장의 기본 규칙에 없음
   */
  private sanitizeExceptionRules(ledger: RuleLedger, file: string): void {
    const baseIds = (rules?: RuleDef[]) => new Set((rules ?? []).map((r) => r.id));

    const check = (
      key: 'exceptionRules' | 'companyExceptionRules' | 'workerExceptionRules',
      allowed: Set<string>,
    ) => {
      const list = ledger[key];
      if (!list) return;
      const kept = list.filter((rule) => {
        if (rule.type !== 'exceptionRule') {
          this.logger.warn(`[${file}] ${key}.${rule.id}: type이 exceptionRule이 아니라 제외합니다(${rule.type}).`);
          return false;
        }
        const failedRule = rule.appliesWhen?.failedRule;
        if (!failedRule) {
          this.logger.warn(`[${file}] ${key}.${rule.id}: appliesWhen.failedRule 이 없어 제외합니다.`);
          return false;
        }
        if (!allowed.has(failedRule)) {
          this.logger.warn(
            `[${file}] ${key}.${rule.id}: 기본 규칙 ${failedRule} 이(가) 같은 원장에 없어 제외합니다.`,
          );
          return false;
        }
        return true;
      });
      if (kept.length !== list.length) ledger[key] = kept;
    };

    check('exceptionRules', baseIds(ledger.rules));
    check('companyExceptionRules', baseIds(ledger.companyRules));
    check('workerExceptionRules', baseIds(ledger.workerRules));

    const total =
      (ledger.exceptionRules?.length ?? 0) +
      (ledger.companyExceptionRules?.length ?? 0) +
      (ledger.workerExceptionRules?.length ?? 0);
    this.logger.log(`[${file}] 예외 규칙 ${total}건`);
  }

  getLedger(typeCode: string, target: 'COMPANY' | 'WORKER' | 'SUBSIDY'): RuleLedger | null {
    return this.ledgers.get(`${typeCode}:${target}`) ?? null;
  }
}
