import { api } from './client';

export interface SubsidySettings {
  id: string;
  businessId: string;
  eligibilityMonths: number;
  updatedAt: string;
}

export interface SubsidyEligibilityRow {
  workerId: string;
  workerName: string;
  workerEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  /** 안내 메일을 받을 주소. 지원금 서류는 기업이 제출하므로 기업 메일이다. */
  companyEmail: string | null;
  hireDate: string;
  eligibleDate: string;
  daysUntilEligible: number;
  eligible: boolean;
  /** 이미 안내 메일을 보낸 사람인지 */
  guidanceSent: boolean;
}

/**
 * 아직 안내 대상이 아닌 근로자. 화면에서 사라지지 않게 이유와 함께 받는다.
 * 여기 떠 있다고 안내 메일이 나가지는 않는다 — 발송은 안내 대상 목록만 쓴다.
 */
export interface SubsidyPendingRow {
  workerId: string;
  workerName: string;
  companyId: string | null;
  companyName: string | null;
  hireDate: string | null;
  reason: string;
  action: string;
  canValidate: boolean;
}

export interface SubsidyCalculationRow {
  id: string;
  workerId: string;
  workerName: string;
  companyName: string | null;
  periodLabel: string;
  workedDays: number;
  baseSalary: number;
  dailyWage: number;
  calculatedAmount: number;
  changeDetected: boolean;
  changeSummary: string | null;
  createdAt: string;
}

export interface CreateSubsidyCalculationInput {
  businessId: string;
  workerId: string;
  periodLabel: string;
  workedDays: number;
}

export const subsidyApi = {
  /** 선택한 근로자를 기업별로 묶어 기업 메일로 안내 발송. */
  sendGuidance: (businessId: string, templateId: string, workerIds: string[]) =>
    api.post<{
      sent: Array<{ companyName: string; to: string; workerNames: string[] }>;
      skipped: Array<{ companyName: string; reason: string; workerNames: string[] }>;
    }>('/subsidy/guidance/send', { businessId, templateId, workerIds }),

  getSettings: (businessId: string) => api.get<SubsidySettings>(`/subsidy/settings?businessId=${businessId}`),
  updateSettings: (businessId: string, eligibilityMonths: number) =>
    api.patch<SubsidySettings>('/subsidy/settings', { businessId, eligibilityMonths }),
  listEligibility: (businessId: string) =>
    api.get<SubsidyEligibilityRow[]>(`/subsidy/eligibility?businessId=${businessId}`),
  listPendingEligibility: (businessId: string) =>
    api.get<SubsidyPendingRow[]>(`/subsidy/eligibility/pending?businessId=${businessId}`),
  calculate: (dto: CreateSubsidyCalculationInput) =>
    api.post<SubsidyCalculationRow>('/subsidy/calculations', dto),
  listCalculations: (params: { businessId?: string; workerId?: string }) => {
    const query = new URLSearchParams();
    if (params.businessId) query.set('businessId', params.businessId);
    if (params.workerId) query.set('workerId', params.workerId);
    const qs = query.toString();
    return api.get<SubsidyCalculationRow[]>(`/subsidy/calculations${qs ? `?${qs}` : ''}`);
  },
  removeCalculation: (id: string) => api.delete<null>(`/subsidy/calculations/${id}`),
};
