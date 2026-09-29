import { Injectable } from '@nestjs/common';
import type { DocumentTypeCode, RuleResult, RuleVerdict } from '@job-program/shared';
import type { ExtractedByDocumentType } from '../../common/domain-validation-engine.interface';
import { JobClassificationService } from './job-classification.service';
import type { RuleDef, RuleLedger } from './validation-rules.service';

/** 사업자등록번호 정규화: 숫자 10자리 → 000-00-00000. 형식이 안 맞으면 null. */
function normalizeBrn(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function isAffirmative(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') {
    return /^(예|y|yes|true|동의|가입|○|O|ㅇ)$/i.test(value.trim());
  }
  return false;
}

/**
 * 도메인 검증 엔진 — 규칙 유형별 핸들러.
 * 규칙 파라미터는 원장(RuleLedger)에서, 직종 판정값은 job-classifications.json 에서 로드한다(하드코딩 X).
 * crossCheck / riskFlag / calcRule 구현. exceptionRule 은 5·6단계에서 확장(현재는 스킵).
 */
@Injectable()
export class DomainValidationEngine {
  constructor(private readonly jobClassificationService: JobClassificationService) {}

  validateWithLedger(ledger: RuleLedger, input: ExtractedByDocumentType): RuleResult[] {
    return ledger.rules.map((rule) => this.evaluate(rule, input));
  }

  private evaluate(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    switch (rule.type) {
      case 'crossCheck':
        return this.crossCheck(rule, input);
      case 'riskFlag':
        return this.riskFlag(rule, input);
      case 'calcRule':
        return this.calcRule(rule, input);
      case 'exceptionRule':
      default:
        // TODO(다음지시서): exceptionRule(법인전환·통장압류)은 6단계에서 구현.
        return {
          ruleId: rule.id,
          type: rule.type,
          label: rule.label,
          verdict: 'NEEDS_REVIEW',
          message: '이 규칙 유형은 아직 구현되지 않았습니다(담당자 확인).',
        };
    }
  }

  /** R-101: 여러 서류의 같은 필드값이 일치하는지. */
  private crossCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const field = rule.field!;
    const docs = rule.documents ?? [];
    const collected: { doc: DocumentTypeCode; raw: unknown; norm: string | null; present: boolean }[] = docs.map(
      (doc) => {
        const data = input[doc];
        const present = !!data && data[field] != null && String(data[field]).trim() !== '';
        const raw = data ? data[field] : undefined;
        const norm = rule.normalize === 'brn' ? normalizeBrn(raw) : raw == null ? null : String(raw).trim();
        return { doc, raw, norm, present };
      },
    );

    const missing = collected.filter((c) => !c.present);
    if (missing.length > 0) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onMismatch ?? 'NEEDS_REVIEW',
        message: `대조할 서류·항목이 없습니다: ${missing.map((m) => m.doc).join(', ')} (담당자 확인)`,
        evidence: { field, values: collected.map((c) => ({ document: c.doc, value: c.norm })) },
      };
    }

    const values = collected.map((c) => c.norm);
    const allEqual = values.every((v) => v !== null && v === values[0]);
    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: allEqual ? 'PASS' : rule.onMismatch ?? 'NEEDS_REVIEW',
      message: allEqual
        ? `${collected.length}개 서류의 ${field} 값이 모두 일치합니다 (${values[0]}).`
        : `${field} 값이 서류 간 불일치합니다 (담당자 확인).`,
      evidence: { field, values: collected.map((c) => ({ document: c.doc, value: c.norm })) },
    };
  }

  /** R-102/R-103: 특정 서류의 필드가 기대값을 만족하는지. */
  private riskFlag(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const fields = rule.fields ?? [];
    const labels = rule.fieldLabels ?? {};

    if (!data) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `${doc} 서류가 없어 확인할 수 없습니다 (담당자 확인).`,
        evidence: { document: doc },
      };
    }

    const checks = fields.map((f) => {
      const value = data[f];
      const ok = rule.expectedBoolean !== undefined ? isAffirmative(value) : String(value ?? '').trim() === rule.expected;
      return { field: f, label: labels[f] ?? f, value: value ?? null, ok };
    });

    const failed = checks.filter((c) => !c.ok);
    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: failed.length === 0 ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message:
        failed.length === 0
          ? `${checks.map((c) => c.label).join('·')} 조건을 모두 충족합니다.`
          : `충족하지 않은 항목: ${failed.map((c) => c.label).join('·')} (담당자 확인).`,
      evidence: { document: doc, checks },
    };
  }

  /** R-104: 모집직종 코드 → 직종분류표 조회 → 가능/제외/담당자확인. */
  private calcRule(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const code = data ? (data[rule.codeField!] as string | undefined) : undefined;
    const title = data ? (data[rule.titleField!] as string | undefined) : undefined;
    const verdictMap = rule.verdictMap ?? {};
    const labelMap = rule.eligibilityLabelMap ?? {};

    const hit = this.jobClassificationService.lookup(code);
    if (!hit) {
      // 코드가 없거나 표에 없으면 임의 통과 금지 → 담당자확인 보류.
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onMissing ?? 'NEEDS_REVIEW',
        message: code
          ? `모집직종 코드 ${code}${title ? `(${title})` : ''}가 직종분류표에 없습니다 — 담당자 확인.`
          : '모집직종 코드가 없어 판정할 수 없습니다 — 담당자 확인.',
        evidence: { code: code ?? null, title: title ?? null },
      };
    }

    const verdict: RuleVerdict = verdictMap[hit.judgment] ?? 'NEEDS_REVIEW';
    const eligibilityLabel = labelMap[verdict] ?? '담당자확인';
    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict,
      message: `모집직종 ${hit.jobName}(${hit.code}) → ${eligibilityLabel}${hit.detail ? ` · 조건: ${hit.detail}` : ''}`,
      evidence: { code: hit.code, jobName: hit.jobName, judgment: hit.judgment, eligibilityLabel, detail: hit.detail ?? null },
    };
  }
}
