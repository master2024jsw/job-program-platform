import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { DocumentTypeCode, RuleVerdict, ValidationRuleType } from '@job-program/shared';

const resourcesDir = path.join(process.cwd(), 'resources');

/** 규칙 원장 한 건 (validation-rules/*.json). 유형별로 파라미터 형태가 다르다. */
export interface RuleDef {
  id: string;
  type: ValidationRuleType;
  label: string;
  // crossCheck
  field?: string;
  documents?: DocumentTypeCode[];
  normalize?: 'brn';
  onMismatch?: RuleVerdict;
  // riskFlag
  document?: DocumentTypeCode;
  fields?: string[];
  fieldLabels?: Record<string, string>;
  expected?: string;
  expectedBoolean?: boolean;
  onFail?: RuleVerdict;
  // calcRule (R-104)
  codeField?: string;
  titleField?: string;
  lookup?: string;
  verdictMap?: Record<string, RuleVerdict>;
  eligibilityLabelMap?: Record<string, string>;
  onMissing?: RuleVerdict;
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
