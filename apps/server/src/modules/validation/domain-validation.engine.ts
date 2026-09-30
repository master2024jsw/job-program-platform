import { Injectable } from '@nestjs/common';
import type { DocumentTypeCode, RuleResult, RuleVerdict } from '@job-program/shared';
import type { ExtractedByDocumentType } from '../../common/domain-validation-engine.interface';
import { JobClassificationService } from './job-classification.service';
import type { MultiDocCheck, RuleDef, RuleLedger } from './validation-rules.service';

/** 사업자등록번호 정규화: 숫자 10자리 → 000-00-00000. 형식이 안 맞으면 null. */
function normalizeBrn(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function isAffirmative(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    // 명시적 부정값은 false
    if (/^(아니요|no|false|미가입|×|x)$/i.test(trimmed)) return false;
    // 명시적 긍정값 또는 비어있지 않은 텍스트(성명·기관명 등) = 기재됨
    return true;
  }
  return false;
}

/** YYYY-MM-DD 또는 YYYYMMDD 등 다양한 날짜 문자열을 Date로 파싱. 실패하면 null. */
function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\./g, '-').replace(/\//g, '-');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 두 날짜 간 개월 수 차이 (끝 - 시작, 소수 가능). */
function monthDiff(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + (end.getDate() - start.getDate()) / 31;
}

/**
 * 도메인 검증 엔진 — 규칙 유형별 핸들러.
 * 규칙 파라미터는 원장(RuleLedger)에서 로드한다(하드코딩 X).
 * crossCheck / riskFlag / calcRule 구현.
 * 5단계 확장: skipIfMissing, optionalDocuments, multiDocumentChecks, calcType(날짜 규칙).
 */
@Injectable()
export class DomainValidationEngine {
  constructor(private readonly jobClassificationService: JobClassificationService) {}

  validateWithLedger(ledger: RuleLedger, input: ExtractedByDocumentType): RuleResult[] {
    return (ledger.rules ?? []).map((rule) => this.evaluate(rule, input));
  }

  /** 규칙 배열을 직접 받아 실행 (6단계 companyRules/workerRules 분리 실행용). */
  validateWithRules(rules: RuleDef[], input: ExtractedByDocumentType): RuleResult[] {
    return rules.map((rule) => this.evaluate(rule, input));
  }

  private evaluate(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    // skipIfMissing: 나열 서류 중 하나라도 없으면 PASS로 스킵 (선택서류 규칙)
    if (rule.skipIfMissing?.some((doc) => !input[doc])) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: 'PASS',
        message: `선택서류(${rule.skipIfMissing.join(', ')}) 미제출 — 이 규칙 스킵.`,
      };
    }

    switch (rule.type) {
      case 'crossCheck':
        return this.crossCheck(rule, input);
      case 'riskFlag':
        return this.riskFlag(rule, input);
      case 'calcRule':
        return this.calcRule(rule, input);
      case 'exceptionRule':
      default:
        return {
          ruleId: rule.id,
          type: rule.type,
          label: rule.label,
          verdict: 'NEEDS_REVIEW',
          message: '이 규칙 유형은 아직 구현되지 않았습니다(담당자 확인).',
        };
    }
  }

  /** crossCheck: 여러 서류의 같은 필드값이 일치하는지. optionalDocuments는 있으면 포함. */
  private crossCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const field = rule.field!;

    // 필수 서류 목록
    const requiredDocs = rule.documents ?? [];
    // 선택 서류: input에 있는 것만 포함
    const optDocs = (rule.optionalDocuments ?? []).filter((doc) => !!input[doc]);
    const docs = [...requiredDocs, ...optDocs];

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

  /** riskFlag: 특정 서류 필드가 기대값을 충족하는지. multiDocumentChecks로 다수 서류 동시 확인 가능. */
  private riskFlag(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    // R-206 등: 여러 서류를 동시에 확인
    if (rule.multiDocumentChecks?.length) {
      return this.multiRiskFlag(rule, input);
    }

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

  /** multiRiskFlag: 여러 서류의 필드를 한 번에 확인 (R-206). */
  private multiRiskFlag(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const allFailed: { document: DocumentTypeCode; field: string; label: string; ok: boolean }[] = [];

    for (const check of rule.multiDocumentChecks as MultiDocCheck[]) {
      const data = input[check.document];
      if (!data) {
        // 서류 자체가 없으면 해당 서류의 모든 필드 실패로 처리
        for (const f of check.fields) {
          allFailed.push({ document: check.document, field: f, label: (check.fieldLabels ?? {})[f] ?? f, ok: false });
        }
        continue;
      }
      for (const f of check.fields) {
        const value = data[f];
        const ok = check.expectedBoolean ? isAffirmative(value) : String(value ?? '').trim() === check.expected;
        if (!ok) allFailed.push({ document: check.document, field: f, label: (check.fieldLabels ?? {})[f] ?? f, ok: false });
      }
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: allFailed.length === 0 ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message:
        allFailed.length === 0
          ? '모든 서류의 서명·기재 항목을 확인했습니다.'
          : `미확인 항목: ${allFailed.map((f) => `${f.document}·${f.label}`).join(', ')} (담당자 확인).`,
      evidence: { failed: allFailed },
    };
  }

  /** calcRule: calcType에 따라 직종판정 또는 날짜/기간/지원금 규칙을 수행. */
  private calcRule(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    switch (rule.calcType ?? 'jobClassification') {
      case 'internPeriodCheck':
        return this.internPeriodCheck(rule, input);
      case 'dateCompare':
        return this.dateCompare(rule, input);
      case 'employmentHistoryDateCheck':
        return this.employmentHistoryDateCheck(rule, input);
      case 'recentWorkplaceCheck':
        return this.recentWorkplaceCheck(rule, input);
      // 6단계 지원금 calcType
      case 'subsidyCalc':
        return this.subsidyCalc(rule, input);
      case 'subsidyTotalCheck':
        return this.subsidyTotalCheck(rule, input);
      case 'subsidyTypeCheck':
        return this.subsidyTypeCheck(rule, input);
      case 'insuranceRosterCheck':
        return this.insuranceRosterCheck(rule, input);
      case 'salaryCompare':
        return this.salaryCompare(rule, input);
      case 'salaryTransferCheck':
        return this.salaryTransferCheck(rule, input);
      case 'jobClassification':
      default:
        return this.jobClassificationCalc(rule, input);
    }
  }

  /** R-104: 모집직종 코드 → 직종분류표 조회 → 가능/제외/담당자확인. */
  private jobClassificationCalc(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const code = data ? (data[rule.codeField!] as string | undefined) : undefined;
    const title = data ? (data[rule.titleField!] as string | undefined) : undefined;
    const verdictMap = rule.verdictMap ?? {};
    const labelMap = rule.eligibilityLabelMap ?? {};

    const hit = this.jobClassificationService.lookup(code);
    if (!hit) {
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

  /** R-205: 근로계약서 인턴약정기간 1~3개월 및 인턴/수습 문구 확인. */
  private internPeriodCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];

    if (!data) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `${doc} 서류가 없어 확인할 수 없습니다.`,
      };
    }

    const startDate = parseDate(data[rule.startField!]);
    const endDate = parseDate(data[rule.endField!]);

    if (!startDate || !endDate) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `인턴약정기간 날짜를 추출하지 못했습니다 (시작: ${data[rule.startField!] ?? '없음'}, 종료: ${data[rule.endField!] ?? '없음'}).`,
        evidence: { start: data[rule.startField!] ?? null, end: data[rule.endField!] ?? null },
      };
    }

    const hasKeyword = rule.internKeywordField ? isAffirmative(data[rule.internKeywordField]) : true;
    const months = monthDiff(startDate, endDate);
    const min = rule.monthsMin ?? 1;
    const max = rule.monthsMax ?? 3;
    const inRange = months >= min && months <= max;

    const startStr = data[rule.startField!] as string;
    const endStr = data[rule.endField!] as string;

    if (!hasKeyword || !inRange) {
      const reason = [!hasKeyword ? '인턴/수습 문구 미확인' : null, !inRange ? `기간 ${months.toFixed(1)}개월(${min}~${max}개월 범위 외)` : null]
        .filter(Boolean)
        .join(', ');
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `인턴약정기간 검증 실패: ${reason} — 담당자 확인.`,
        evidence: { start: startStr, end: endStr, months: +months.toFixed(1), hasKeyword },
      };
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: 'PASS',
      message: `인턴약정기간 ${months.toFixed(1)}개월 (${startStr} ~ ${endStr}), 인턴/수습 문구 확인됨.`,
      evidence: { start: startStr, end: endStr, months: +months.toFixed(1), hasKeyword },
    };
  }

  /** R-208: 교육일자 ≥ 근로시작일 (날짜 대소 비교). */
  private dateCompare(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;

    const dateVal = data ? data[rule.dateField!] : null;
    const anchorVal = anchorData ? anchorData[rule.anchorField!] : null;

    const date = parseDate(dateVal);
    const anchor = parseDate(anchorVal);

    if (!date || !anchor) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `날짜를 추출하지 못했습니다 (대상: ${dateVal ?? '없음'}, 기준: ${anchorVal ?? '없음'}).`,
        evidence: { date: dateVal ?? null, anchor: anchorVal ?? null },
      };
    }

    const pass = rule.dateRelation === 'onOrAfter' ? date >= anchor : date < anchor;
    const symbol = rule.dateRelation === 'onOrAfter' ? '≥' : '<';
    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: pass ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: pass
        ? `${String(dateVal)} ${symbol} ${String(anchorVal)} — 정상.`
        : `${String(dateVal)}이 기준일(${String(anchorVal)})보다 이전입니다 — 담당자 확인.`,
      evidence: { date: String(dateVal), anchor: String(anchorVal), relation: rule.dateRelation },
    };
  }

  /** R-203: 고용보험이력의 모든 사업장 상실일이 근로시작일 이전인지 확인. */
  private employmentHistoryDateCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const anchorVal = anchorData ? anchorData[rule.anchorField!] : null;
    const anchor = parseDate(anchorVal);

    if (!anchor) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: 'NEEDS_REVIEW',
        message: `근로시작일을 확인할 수 없습니다 (${String(anchorVal ?? '없음')}) — 담당자 확인.`,
      };
    }

    const workplaces = data ? (data[rule.workplacesField!] as unknown[]) : null;
    if (!workplaces?.length) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: 'NEEDS_REVIEW',
        message: '고용보험 이력 항목을 추출하지 못했습니다 — 담당자 확인.',
      };
    }

    const problematic: unknown[] = [];
    for (const wp of workplaces) {
      const w = wp as Record<string, unknown>;
      const lossDate = parseDate(w[rule.lossDateField ?? 'lossDate']);
      if (!lossDate || lossDate >= anchor) {
        problematic.push({ companyName: w.companyName ?? '?', lossDate: w[rule.lossDateField ?? 'lossDate'] ?? '없음' });
      }
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: problematic.length === 0 ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message:
        problematic.length === 0
          ? `모든 이전 직장(${workplaces.length}건) 상실일이 근로시작일(${String(anchorVal)}) 이전 — 정상.`
          : `상실일 미확인 또는 근로시작일 이후인 이력 ${problematic.length}건 — 이중취득 위험, 담당자 확인.`,
      evidence: { anchor: String(anchorVal), total: workplaces.length, problematic },
    };
  }

  // ── 6단계 지원금 calcType ──────────────────────────────────────────────

  /** R-303: 회차별 지원금 산정 검산. min(급여×50%, max) 공식. */
  private subsidyCalc(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const entries = data ? (data[rule.entriesField ?? 'entries'] as unknown[]) : null;
    if (!entries?.length) {
      return {
        ruleId: rule.id, type: rule.type, label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: '산출내역 항목을 추출하지 못했습니다 — 담당자 확인.',
      };
    }
    const internMax = rule.internMaxAmount ?? 400000;
    const hireMax = rule.hireMaxAmount ?? 500000;
    const mismatches: unknown[] = [];
    let totalCalc = 0;
    for (const e of entries) {
      const entry = e as Record<string, unknown>;
      const salary = Number(entry[rule.salaryField ?? 'baseSalary'] ?? 0);
      const declared = Number(entry[rule.amountField ?? 'subsidyAmount'] ?? 0);
      const typeStr = String(entry[rule.typeField ?? 'subsidyType'] ?? '').toLowerCase();
      const isHire = typeStr.includes('채용') || typeStr === 'hire';
      const maxAmt = isHire ? hireMax : internMax;
      const calculated = Math.min(Math.round(salary * 0.5), maxAmt);
      totalCalc += calculated;
      if (Math.abs(declared - calculated) > (rule.toleranceAmount ?? 0)) {
        mismatches.push({ round: entry.round, periodLabel: entry.periodLabel, salary, declared, calculated, subsidyType: typeStr });
      }
    }
    return {
      ruleId: rule.id, type: rule.type, label: rule.label,
      verdict: mismatches.length === 0 ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: mismatches.length === 0
        ? `전 회차(${entries.length}건) 지원금 산정 정상. 합계 ${totalCalc.toLocaleString()}원.`
        : `산정 불일치 ${mismatches.length}건 — 담당자 확인.`,
      evidence: { total: entries.length, totalCalc, mismatches },
    };
  }

  /** R-309: 신청서 총 신청금액 = 산출내역 회차 합계 일치. */
  private subsidyTotalCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const appData = input[doc];
    const calcData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const totalDeclared = appData ? Number(appData[rule.totalField ?? 'totalAmount'] ?? 0) : 0;
    const entries = calcData ? (calcData[rule.entriesField ?? 'entries'] as unknown[]) : null;
    const totalCalc = entries?.reduce((sum: number, e) => sum + Number((e as Record<string, unknown>)[rule.amountField ?? 'subsidyAmount'] ?? 0), 0) ?? 0;
    const tolerance = rule.toleranceAmount ?? 0;
    const match = Math.abs(totalDeclared - totalCalc) <= tolerance;
    return {
      ruleId: rule.id, type: rule.type, label: rule.label,
      verdict: match ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: match
        ? `신청금액(${totalDeclared.toLocaleString()}) = 산출내역 합계(${totalCalc.toLocaleString()}) — 일치.`
        : `신청금액(${totalDeclared.toLocaleString()}) ≠ 산출내역 합계(${totalCalc.toLocaleString()}) — 담당자 확인.`,
      evidence: { totalDeclared, totalCalc, entries: entries?.length ?? 0 },
    };
  }

  /** R-304: 신청지원금 유형·기간이 근로계약서와 일치하는지 확인. */
  private subsidyTypeCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const entries = data ? (data[rule.entriesField ?? 'entries'] as unknown[]) : null;
    if (!entries?.length) {
      return {
        ruleId: rule.id, type: rule.type, label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: '산출내역 항목을 추출하지 못했습니다 — 담당자 확인.',
      };
    }
    const contractStart = anchorData ? parseDate(anchorData[rule.anchorField ?? 'internStartDate']) : null;
    const contractEnd = anchorData ? parseDate(anchorData[rule.anchorEndField ?? 'internEndDate']) : null;
    if (!contractStart) {
      return {
        ruleId: rule.id, type: rule.type, label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: '근로계약서 인턴약정기간을 확인할 수 없습니다 — 담당자 확인.',
      };
    }
    // 인턴 회차 기간이 계약 기간 내에 있는지 확인
    const issues: unknown[] = [];
    for (const e of entries) {
      const entry = e as Record<string, unknown>;
      const period = String(entry[rule.periodField ?? 'periodLabel'] ?? '');
      const periodMonth = parseDate(period.length <= 7 ? `${period}-01` : period);
      if (periodMonth && contractEnd && periodMonth > contractEnd) {
        issues.push({ round: entry.round, periodLabel: period, reason: '계약종료일 이후 월' });
      }
      if (periodMonth && periodMonth < contractStart) {
        issues.push({ round: entry.round, periodLabel: period, reason: '계약시작일 이전 월' });
      }
    }
    return {
      ruleId: rule.id, type: rule.type, label: rule.label,
      verdict: issues.length === 0 ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: issues.length === 0
        ? `전 회차 급여월이 인턴약정기간(${String(anchorData?.[rule.anchorField ?? 'internStartDate'] ?? '')}~${String(anchorData?.[rule.anchorEndField ?? 'internEndDate'] ?? '')}) 내 — 정상.`
        : `약정기간 외 급여월 ${issues.length}건 — 담당자 확인.`,
      evidence: { contractStart: String(anchorData?.[rule.anchorField ?? 'internStartDate'] ?? ''), contractEnd: String(anchorData?.[rule.anchorEndField ?? 'internEndDate'] ?? ''), issues },
    };
  }

  /** R-305: 가입자명부 참여자 취득일·사업자번호 대조. */
  private insuranceRosterCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const ctxData = input['COMPANY_CONTEXT' as DocumentTypeCode];
    if (!data) {
      return {
        ruleId: rule.id, type: rule.type, label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: '가입자명부 서류가 없거나 추출 불가 — 담당자 확인.',
      };
    }
    const entries = data[rule.entriesField ?? 'entries'] as unknown[] | undefined;
    const rosterBrn = normalizeBrn(data.businessRegistrationNumber);
    const ctxBrn = ctxData ? normalizeBrn(ctxData.businessRegistrationNumber) : null;
    const internStart = anchorData ? parseDate(anchorData[rule.anchorField ?? 'internStartDate']) : null;
    const issues: unknown[] = [];
    // 사업자번호 불일치
    if (rosterBrn && ctxBrn && rosterBrn !== ctxBrn) {
      issues.push({ type: 'brnMismatch', roster: rosterBrn, company: ctxBrn });
    }
    // 참여자명 확인 (WORKER_CONTEXT에서 이름 가져옴)
    const workerCtx = input['WORKER_CONTEXT' as DocumentTypeCode];
    const workerName = workerCtx ? String(workerCtx.name ?? '').trim() : null;
    if (workerName && entries?.length) {
      const found = (entries as Record<string, unknown>[]).some((e) =>
        String(e.name ?? '').replace(/\s/g, '') === workerName.replace(/\s/g, ''),
      );
      if (!found) issues.push({ type: 'workerNotFound', name: workerName });
      else {
        // 취득일 = 근로시작일 확인
        const entry = (entries as Record<string, unknown>[]).find(
          (e) => String(e.name ?? '').replace(/\s/g, '') === workerName.replace(/\s/g, ''),
        )!;
        const acqDate = parseDate(entry.acquisitionDate ?? entry.healthInsuranceDate ?? entry.employmentInsuranceDate);
        if (internStart && acqDate && Math.abs(acqDate.getTime() - internStart.getTime()) > 86400000 * 3) {
          issues.push({ type: 'acquisitionDateMismatch', workerName, acq: String(entry.acquisitionDate ?? ''), internStart: String(anchorData?.[rule.anchorField ?? 'internStartDate'] ?? '') });
        }
      }
    }
    return {
      ruleId: rule.id, type: rule.type, label: rule.label,
      verdict: issues.length === 0 ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: issues.length === 0
        ? `가입자명부 사업자번호·참여자 취득일 확인 — 정상.`
        : `가입자명부 확인 필요(${issues.map((i) => (i as Record<string, unknown>).type).join(', ')}) — 담당자 확인.`,
      evidence: { rosterBrn, ctxBrn, workerName, issues },
    };
  }

  /** R-306: 명세서 기본급 ≥ 근로계약서 월급여. */
  private salaryCompare(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const payrollSalary = data ? Number(data[rule.salaryField ?? 'baseSalary'] ?? 0) : 0;
    const contractSalary = anchorData ? Number(anchorData[rule.anchorField ?? 'baseSalary'] ?? 0) : 0;
    if (!payrollSalary || !contractSalary) {
      return {
        ruleId: rule.id, type: rule.type, label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `급여 정보를 추출하지 못했습니다 (명세서: ${payrollSalary || '없음'}, 계약서: ${contractSalary || '없음'}) — 담당자 확인.`,
        evidence: { payrollSalary, contractSalary },
      };
    }
    const ok = payrollSalary >= contractSalary;
    return {
      ruleId: rule.id, type: rule.type, label: rule.label,
      verdict: ok ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: ok
        ? `명세서 기본급(${payrollSalary.toLocaleString()}) ≥ 계약 월급여(${contractSalary.toLocaleString()}) — 정상.`
        : `명세서 기본급(${payrollSalary.toLocaleString()}) < 계약 월급여(${contractSalary.toLocaleString()}) — 임금 부족, 담당자 확인.`,
      evidence: { payrollSalary, contractSalary },
    };
  }

  /** R-307: 이체확인증 이체금액 = 명세서 차감지급액(netPay). */
  private salaryTransferCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const transferAmt = data ? Number(data[rule.transferField ?? 'transferAmount'] ?? 0) : 0;
    // netPay 또는 totalPay - totalDeduction 계산
    let netPay = anchorData ? Number(anchorData[rule.netPayField ?? 'netPay'] ?? 0) : 0;
    if (!netPay && anchorData) {
      const total = Number(anchorData.totalPay ?? 0);
      const deduction = Number(anchorData.totalDeduction ?? 0);
      if (total && deduction) netPay = total - deduction;
    }
    const tolerance = rule.toleranceAmount ?? 1000;
    if (!transferAmt || !netPay) {
      return {
        ruleId: rule.id, type: rule.type, label: rule.label,
        verdict: rule.onFail ?? 'NEEDS_REVIEW',
        message: `이체금액 또는 차감지급액을 추출하지 못했습니다 — 담당자 확인.`,
        evidence: { transferAmt, netPay },
      };
    }
    const match = Math.abs(transferAmt - netPay) <= tolerance;
    return {
      ruleId: rule.id, type: rule.type, label: rule.label,
      verdict: match ? 'PASS' : rule.onFail ?? 'NEEDS_REVIEW',
      message: match
        ? `이체금액(${transferAmt.toLocaleString()}) = 차감지급액(${netPay.toLocaleString()}) — 일치.`
        : `이체금액(${transferAmt.toLocaleString()}) ≠ 차감지급액(${netPay.toLocaleString()}) — 불일치, 담당자 확인.`,
      evidence: { transferAmt, netPay, diff: Math.abs(transferAmt - netPay) },
    };
  }

  /** R-204: 근로시작일 기준 N일 이내 참여기업과 동일 사업장 근무 이력 확인. */
  private recentWorkplaceCheck(rule: RuleDef, input: ExtractedByDocumentType): RuleResult {
    const doc = rule.document!;
    const data = input[doc];
    const anchorData = rule.anchorDocument ? input[rule.anchorDocument] : null;
    const ctxData = input['COMPANY_CONTEXT' as DocumentTypeCode];

    const anchorVal = anchorData ? anchorData[rule.anchorField!] : null;
    const anchor = parseDate(anchorVal);
    const companyName = ctxData ? String(ctxData.companyName ?? '').trim() : null;

    if (!anchor || !companyName) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: 'NEEDS_REVIEW',
        message: `근로시작일 또는 참여기업명을 확인할 수 없습니다 — 담당자 확인.`,
      };
    }

    const workplaces = data ? (data[rule.workplacesField!] as unknown[]) : null;
    if (!workplaces?.length) {
      return {
        ruleId: rule.id,
        type: rule.type,
        label: rule.label,
        verdict: 'PASS',
        message: '고용보험 이력이 없거나 추출 불가 — 이 규칙 스킵.',
      };
    }

    const threshold = rule.daysThreshold ?? 90;
    const normalize = (s: string) => s.replace(/[\s㈜(주)]/g, '').toLowerCase();
    const ctxNorm = normalize(companyName);

    const recentMatches: unknown[] = [];
    for (const wp of workplaces) {
      const w = wp as Record<string, unknown>;
      const wpName = normalize(String(w[rule.companyNameField ?? 'companyName'] ?? ''));
      if (!wpName || (!wpName.includes(ctxNorm) && !ctxNorm.includes(wpName))) continue;

      // 사업장과 참여기업 이름이 유사 → 90일 이내인지 확인
      const lossDate = parseDate(w[rule.lossDateField ?? 'lossDate']);
      const startDate = parseDate(w[rule.startDateField ?? 'startDate']);
      const refDate = lossDate ?? anchor; // 상실일 없으면 아직 재직 중
      const dayDiff = (anchor.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
      const withinThreshold = dayDiff >= -1 && dayDiff <= threshold; // refDate가 anchor 이전 threshold일 이내
      const _ = startDate; // 사용하지 않지만 참조용
      if (withinThreshold) {
        recentMatches.push({ companyName: w.companyName, lossDate: w[rule.lossDateField ?? 'lossDate'] });
      }
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      label: rule.label,
      verdict: recentMatches.length === 0 ? 'PASS' : rule.onFail ?? 'FAIL',
      message:
        recentMatches.length === 0
          ? `${threshold}일 이내 참여기업(${companyName}) 동일 사업장 근무 이력 없음 — 정상.`
          : `${companyName}에서 근로시작일 기준 ${threshold}일 이내 근무 이력 발견 — 제외사유(담당자 확인).`,
      evidence: { anchor: String(anchorVal), companyName, threshold, recentMatches },
    };
  }
}
