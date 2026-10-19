import { api } from './client';

export type Verdict = 'PASS' | 'NEEDS_REVIEW' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
export type BenefitType = 'INTERN' | 'HIRE';

export interface ProRataBreakdown {
  coveredDays: number;
  totalDays: number;
  proRatedSalaryWon: number;
  beforeCapWon: number;
  amountWon: number;
  capApplied: boolean;
}

export interface RoundResult {
  round: number;
  periodStart: string;
  periodEnd: string;
  amountWon: number | null;
  verdict: Verdict;
  reason: string;
  proRata?: ProRataBreakdown;
}

export interface BenefitResult {
  benefitType: BenefitType;
  label: string;
  verdict: Verdict;
  reason: string;
  rounds: RoundResult[];
  totalWon: number;
}

export interface CalcResult {
  policyId: string;
  policyVersion: string;
  input: {
    monthlySalaryWon: number | null;
    hireDate: string | null;
    internEndDate: string | null;
    continuousHireDate: string | null;
    continuousContractMonths: number | null;
    alreadyApprovedWon: number;
    asOfDate: string;
  };
  benefits: BenefitResult[];
  grandTotalWon: number;
  capWarning: string | null;
}

export interface SubsidyClaim {
  id: string;
  businessId: string;
  participationId: string;
  benefitType: BenefitType;
  round: number;
  periodStart: string;
  periodEnd: string;
  requestedAmountWon?: number | null;
  calculatedAmountWon?: number | null;
  approvedAmountWon?: number | null;
  paidAmountWon?: number | null;
  policyId?: string | null;
  policyVersion?: string | null;
  verdict?: Verdict | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateResult {
  created: SubsidyClaim[];
  skipped: Array<{ benefitType: string; round: number; verdict: string; reason: string }>;
  capWarning: string | null;
}

export const subsidyClaimsApi = {
  list: (businessId: string, participationId?: string) => {
    const q = new URLSearchParams({ businessId });
    if (participationId) q.set('participationId', participationId);
    return api.get<SubsidyClaim[]>(`/subsidy-claims?${q.toString()}`);
  },
  /** 저장하지 않는 산정 미리보기. asOfDate 로 "그때 기준" 결과를 볼 수 있다. */
  preview: (businessId: string, participationId: string, asOfDate?: string) => {
    const q = new URLSearchParams({ businessId });
    if (asOfDate) q.set('asOfDate', asOfDate);
    return api.get<CalcResult>(`/subsidy-claims/preview/${participationId}?${q.toString()}`);
  },
  generate: (businessId: string, participationId: string, asOfDate?: string) => {
    const q = new URLSearchParams({ businessId });
    if (asOfDate) q.set('asOfDate', asOfDate);
    return api.post<GenerateResult>(`/subsidy-claims/generate/${participationId}?${q.toString()}`);
  },
  remove: (businessId: string, id: string) =>
    api.delete<null>(`/subsidy-claims/${id}?businessId=${encodeURIComponent(businessId)}`),
};
