import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { DocumentTypeCode, RuleVerdict, ValidationRuleType } from '@job-program/shared';

const resourcesDir = path.join(process.cwd(), 'resources');

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
  normalize?: 'brn';
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
  // calcRule (R-104 직종판정 / 5단계 날짜·기간 규칙)
  calcType?: 'jobClassification' | 'internPeriodCheck' | 'dateCompare' | 'employmentHistoryDateCheck' | 'recentWorkplaceCheck';
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
}

export interface RuleLedger {
  typeCode: string;
  target: 'COMPANY' | 'WORKER';
  guidelineYear: number;
  source: string;
  documentFields: Partial<Record<DocumentTypeCode, string[]>>;
  rules: RuleDef[];
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
        this.ledgers.set(`${ledger.typeCode}:${ledger.target}`, ledger);
      } catch (error) {
        this.logger.error(`검증규칙 파일 로드 실패(${filePath}): ${error instanceof Error ? error.message : error}`);
      }
    }
    this.logger.log(`검증규칙 원장 ${this.ledgers.size}건 로드`);
  }

  getLedger(typeCode: string, target: 'COMPANY' | 'WORKER'): RuleLedger | null {
    return this.ledgers.get(`${typeCode}:${target}`) ?? null;
  }
}
