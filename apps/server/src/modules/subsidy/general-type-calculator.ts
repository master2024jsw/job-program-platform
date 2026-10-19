/**
 * 현장실습 훈련 지원사업 — 일반형 참여기업 지원금 계산기.
 *
 * 설계서 §4.3: 규칙엔진은 DB·HTTP·Gemini 를 직접 호출하지 않는 순수 계산기로 둔다.
 * 이 파일은 입력과 정책만 받아 결과를 돌려준다. 그래서 합성 입력만으로 반복 테스트할 수 있다.
 *
 * 설계서 §10.4 판정값: PASS / NEEDS_REVIEW / INSUFFICIENT_DATA / NOT_APPLICABLE.
 * 값이 없거나 규칙이 확정되지 않은 것을 '0원'이나 '충족'으로 처리하지 않는다.
 *
 * 금액은 원 단위 정수로만 다룬다 (설계서 §11).
 * 정책 원장: resources/subsidy-policies/SENIOR-2026-GENERAL.json
 */

export type BenefitType = 'INTERN' | 'HIRE';

/** 설계서 §10.4 의 업무판정. 기술 실패(FAILED)와는 구분한다. */
export type Verdict = 'PASS' | 'NEEDS_REVIEW' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';

export interface BenefitPolicy {
  benefitType: BenefitType;
  label: string;
  rateOfMonthlySalary: number;
  monthlyCapWon: number;
  maxRounds: number;
  anchorField: 'hireDate' | 'continuousHireDate';
  anchorLabel: string;
  requires?: {
    internCompleted?: boolean;
    continuousContractMinMonths?: number;
  };
}

/**
 * 일할계산 규칙. 실무 담당 확인(2026-10-15):
 *   "일할로 지급한다. 다만 일할금액이 80만원을 넘으면 그냥 40만원으로 지급한다."
 * 80만원은 별도 기준값이 아니라 `월상한 / 지급률`(400,000 / 0.5)에서 자동으로 나오는 분기점이다.
 * 월상한 자체는 일할하지 않는다(capIsProRated=false).
 */
export interface ProRataPolicy {
  enabled: boolean;
  /** 월급여를 며칠로 나눌지. 한국 급여 관행의 30일. */
  divisorDays: number;
  /** 월 상한도 일수에 비례해 줄일지. 담당 확인 결과 false. */
  capIsProRated: boolean;
}

export interface SubsidyPolicy {
  policyId: string;
  version: string;
  participationType: string;
  perPersonTotalCapWon: number;
  benefits: BenefitPolicy[];
  proRata?: ProRataPolicy;
}

/** 계산에 쓰는 입력 스냅샷. 설계서 §10.3 — 무엇을 보고 계산했는지 남기기 위해 그대로 보존한다. */
export interface CalcInput {
  /** 근로계약서 기준 월급여(원). 모르면 null — 0 으로 채우지 않는다. */
  monthlySalaryWon: number | null;
  /** 입사일 YYYY-MM-DD */
  hireDate: string | null;
  /** 인턴 종료(예정)일 YYYY-MM-DD */
  internEndDate: string | null;
  /** 계속고용 개시일 YYYY-MM-DD */
  continuousHireDate: string | null;
  /** 계속고용 계약기간(개월). 자료에 없으면 null — '6개월 이상'을 확인할 수 없다는 뜻이다. */
  continuousContractMonths: number | null;
  /** 이미 승인되어 지급 대상이 된 누적 금액(원). 총액 상한 확인용. */
  alreadyApprovedWon: number;
  /** 판정 기준일 YYYY-MM-DD. 설계서 §10.1 — 무조건 오늘이 아니다. 호출자가 명시한다. */
  asOfDate: string;
}

export interface RoundResult {
  round: number;
  periodStart: string;
  periodEnd: string;
  /** 이 회차의 산정액(원). 판정이 PASS 가 아니면 null. */
  amountWon: number | null;
  verdict: Verdict;
  reason: string;
  /** 일할계산된 회차면 그 내역. 아니면 없음. */
  proRata?: ProRataBreakdown;
}

export interface BenefitResult {
  benefitType: BenefitType;
  label: string;
  verdict: Verdict;
  reason: string;
  rounds: RoundResult[];
  /** PASS 인 회차의 합계(원). */
  totalWon: number;
}

export interface CalcResult {
  policyId: string;
  policyVersion: string;
  /** 설계서 §10.3 — 어떤 입력으로 계산했는지 그대로 보존한다. */
  input: CalcInput;
  benefits: BenefitResult[];
  /** PASS 인 회차 전체 합계(원). */
  grandTotalWon: number;
  /** 총액 상한을 넘었으면 메시지. 넘지 않았으면 null. */
  capWarning: string | null;
}

const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function isValidDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** YYYY-MM-DD 에 개월을 더한다. 말일 넘침은 그 달 말일로 맞춘다(1/31 + 1개월 = 2/28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** 하루 뺀 날짜 (기간 종료일 계산용). */
function minusOneDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 사이의 일수 (양끝 포함). '2026-11-03'~'2026-11-20' = 18일. */
export function daysInclusive(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * 한 회차 금액 = min(월급여 x 지급률, 월 상한).
 * 원 단위 정수로 내림한다. 표에 반올림 규칙이 없으므로 기업에 유리하게 올리지 않는다.
 */
export function roundAmount(monthlySalaryWon: number, policy: BenefitPolicy): number {
  const byRate = Math.floor(monthlySalaryWon * policy.rateOfMonthlySalary);
  return Math.min(byRate, policy.monthlyCapWon);
}

export interface ProRataBreakdown {
  /** 이 회차에서 실제로 인정되는 일수 */
  coveredDays: number;
  /** 회차 전체 일수 */
  totalDays: number;
  /** 일할 계산된 급여(원) */
  proRatedSalaryWon: number;
  /** 지급률 적용 후 금액(상한 적용 전) */
  beforeCapWon: number;
  /** 상한 적용 후 최종 금액 */
  amountWon: number;
  /** 상한이 적용되었는가 */
  capApplied: boolean;
}

/**
 * 일할 금액 = min( min(월급여 / divisorDays x 일수, 월급여) x 지급률, 월 상한 ).
 *
 * 바깥 min 이 "일할급여가 80만원을 넘으면 그냥 40만원" 을 만든다.
 * 안쪽 min 은 회차가 31일일 때 31/30 을 곱해 월급여를 넘지 않게 막는다.
 */
export function proRataAmount(
  monthlySalaryWon: number,
  coveredDays: number,
  totalDays: number,
  benefit: BenefitPolicy,
  proRata: ProRataPolicy,
): ProRataBreakdown {
  const divisor = proRata.divisorDays > 0 ? proRata.divisorDays : 30;
  const raw = (monthlySalaryWon / divisor) * coveredDays;
  const proRatedSalaryWon = Math.floor(Math.min(raw, monthlySalaryWon));
  const beforeCapWon = Math.floor(proRatedSalaryWon * benefit.rateOfMonthlySalary);

  const cap = proRata.capIsProRated
    ? Math.floor(benefit.monthlyCapWon * (coveredDays / Math.max(totalDays, 1)))
    : benefit.monthlyCapWon;

  const amountWon = Math.min(beforeCapWon, cap);
  return {
    coveredDays,
    totalDays,
    proRatedSalaryWon,
    beforeCapWon,
    amountWon,
    capApplied: beforeCapWon > cap,
  };
}

const won = (n: number): string => n.toLocaleString('ko-KR');

function evaluateBenefit(
  policy: BenefitPolicy,
  input: CalcInput,
  proRata: ProRataPolicy | undefined,
): BenefitResult {
  const empty = (verdict: Verdict, reason: string): BenefitResult => ({
    benefitType: policy.benefitType,
    label: policy.label,
    verdict,
    reason,
    rounds: [],
    totalWon: 0,
  });

  if (input.monthlySalaryWon === null) {
    return empty('INSUFFICIENT_DATA', '월급여를 확인할 수 없습니다. 근로계약서의 월급여가 필요합니다.');
  }
  if (input.monthlySalaryWon <= 0) {
    return empty('NEEDS_REVIEW', '월급여가 ' + input.monthlySalaryWon + '원으로 기록되어 있습니다. 확인이 필요합니다.');
  }
  if (!Number.isSafeInteger(Math.round(input.monthlySalaryWon))) {
    return empty('NEEDS_REVIEW', '월급여 값이 처리 가능한 범위를 벗어났습니다.');
  }

  const anchor = policy.anchorField === 'hireDate' ? input.hireDate : input.continuousHireDate;

  if (policy.benefitType === 'HIRE') {
    if (!isValidDate(input.internEndDate)) {
      return empty('INSUFFICIENT_DATA', '인턴 종료일을 확인할 수 없어 채용 지원금 대상 여부를 판단할 수 없습니다.');
    }
    if (!isValidDate(anchor)) {
      return empty('NOT_APPLICABLE', '계속고용 개시일이 없습니다. 아직 채용 지원금 대상이 아닙니다.');
    }
    if (anchor < input.internEndDate) {
      return empty(
        'NEEDS_REVIEW',
        '계속고용 개시일(' + anchor + ')이 인턴 종료일(' + input.internEndDate + ')보다 빠릅니다. 확인이 필요합니다.',
      );
    }
    const min = policy.requires?.continuousContractMinMonths;
    if (min !== undefined) {
      if (input.continuousContractMonths === null) {
        return empty(
          'NEEDS_REVIEW',
          '계속고용 계약기간을 확인할 수 없습니다. ' + min + '개월 이상 요건 충족 여부를 자료로 확인해야 합니다. (정책 미확정 U-02)',
        );
      }
      if (input.continuousContractMonths < min) {
        return empty(
          'NOT_APPLICABLE',
          '계속고용 계약기간이 ' + input.continuousContractMonths + '개월로 ' + min + '개월 미만입니다.',
        );
      }
    }
  }

  if (!isValidDate(anchor)) {
    return empty('INSUFFICIENT_DATA', policy.anchorLabel + '을 확인할 수 없습니다.');
  }

  const perRound = roundAmount(input.monthlySalaryWon, policy);
  const rounds: RoundResult[] = [];

  for (let i = 0; i < policy.maxRounds; i++) {
    const periodStart = addMonths(anchor, i);
    const periodEnd = minusOneDay(addMonths(anchor, i + 1));

    if (periodEnd > input.asOfDate) {
      rounds.push({
        round: i + 1,
        periodStart,
        periodEnd,
        amountWon: null,
        verdict: 'NOT_APPLICABLE',
        reason: '아직 기간이 끝나지 않았습니다 (종료 ' + periodEnd + ', 기준일 ' + input.asOfDate + ').',
      });
      continue;
    }

    if (policy.benefitType === 'INTERN' && isValidDate(input.internEndDate)) {
      // 회차가 통째로 인턴기간 밖이면 보완할 자료가 없다. '해당 없음'이지 '자료 부족'이 아니다.
      if (input.internEndDate < periodStart) {
        rounds.push({
          round: i + 1,
          periodStart,
          periodEnd,
          amountWon: null,
          verdict: 'NOT_APPLICABLE',
          reason:
            '인턴 종료일(' + input.internEndDate + ') 이후의 회차입니다. 인턴 기간이 ' +
            '이 회차 시작일(' + periodStart + ') 전에 끝나 산정 대상이 아닙니다.',
        });
        continue;
      }
      // 회차 중간에 끝난 경우: 일할계산한다 (실무 담당 확인, 2026-10-15).
      if (input.internEndDate < periodEnd) {
        if (!proRata || !proRata.enabled) {
          rounds.push({
            round: i + 1,
            periodStart,
            periodEnd,
            amountWon: null,
            verdict: 'INSUFFICIENT_DATA',
            reason: '회차 중간에 인턴이 끝났는데 일할계산 규칙이 설정되지 않았습니다.',
          });
          continue;
        }
        const coveredDays = daysInclusive(periodStart, input.internEndDate);
        const totalDays = daysInclusive(periodStart, periodEnd);
        const b = proRataAmount(input.monthlySalaryWon, coveredDays, totalDays, policy, proRata);
        rounds.push({
          round: i + 1,
          periodStart,
          periodEnd,
          amountWon: b.amountWon,
          verdict: 'PASS',
          proRata: b,
          reason:
            '일할계산: 인턴 종료일 ' + input.internEndDate + ' 까지 ' + b.coveredDays + '/' + b.totalDays + '일. ' +
            '월급여 ' + won(input.monthlySalaryWon) + '원 / ' + proRata.divisorDays + '일 x ' + b.coveredDays + '일 = ' +
            won(b.proRatedSalaryWon) + '원, x ' + policy.rateOfMonthlySalary * 100 + '% = ' + won(b.beforeCapWon) + '원' +
            (b.capApplied ? ', 월 상한 ' + won(policy.monthlyCapWon) + '원 적용 -> ' + won(b.amountWon) + '원' : ''),
        });
        continue;
      }
    }

    rounds.push({
      round: i + 1,
      periodStart,
      periodEnd,
      amountWon: perRound,
      verdict: 'PASS',
      reason:
        '월급여 ' + won(input.monthlySalaryWon) + '원 x ' + policy.rateOfMonthlySalary * 100 + '% = ' +
        won(Math.floor(input.monthlySalaryWon * policy.rateOfMonthlySalary)) + '원, 월 상한 ' +
        won(policy.monthlyCapWon) + '원 적용 -> ' + won(perRound) + '원',
    });
  }

  const passed = rounds.filter((r) => r.verdict === 'PASS');
  const totalWon = passed.reduce((a, r) => a + (r.amountWon ?? 0), 0);

  // 설계서 §10.4 — 실행된 회차가 하나도 PASS 가 아닌 것을 자동 PASS 로 집계하지 않는다.
  let verdict: Verdict = 'PASS';
  let reason = passed.length + '개 회차 산정 완료.';
  if (passed.length === 0) {
    const anyInsufficient = rounds.some((r) => r.verdict === 'INSUFFICIENT_DATA');
    verdict = anyInsufficient ? 'INSUFFICIENT_DATA' : 'NOT_APPLICABLE';
    reason = anyInsufficient
      ? '산정 가능한 회차가 없습니다. 자료 보완이 필요합니다.'
      : '아직 산정 대상 회차가 없습니다.';
  } else if (passed.length < policy.maxRounds) {
    reason = passed.length + '/' + policy.maxRounds + '개 회차 산정 완료. 나머지는 사유를 확인하세요.';
  }

  return { benefitType: policy.benefitType, label: policy.label, verdict, reason, rounds, totalWon };
}

export function calculateGeneralType(policy: SubsidyPolicy, input: CalcInput): CalcResult {
  const benefits = policy.benefits.map((b) => evaluateBenefit(b, input, policy.proRata));
  const grandTotalWon = benefits.reduce((a, b) => a + b.totalWon, 0);

  const cumulative = grandTotalWon + input.alreadyApprovedWon;
  const capWarning =
    cumulative > policy.perPersonTotalCapWon
      ? '1인당 총액 상한 ' + won(policy.perPersonTotalCapWon) + '원을 초과합니다 (기승인 ' +
        won(input.alreadyApprovedWon) + '원 + 이번 산정 ' + won(grandTotalWon) + '원 = ' +
        won(cumulative) + '원). 승인 전 확인이 필요합니다.'
      : null;

  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    input,
    benefits,
    grandTotalWon,
    capWarning,
  };
}
