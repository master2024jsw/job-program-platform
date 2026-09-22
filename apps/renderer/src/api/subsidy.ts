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
  hireDate: string;
  eligibleDate: string;
  daysUntilEligible: number;
  eligible: boolean;
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
  getSettings: (businessId: string) => api.get<SubsidySettings>(`/subsidy/settings?businessId=${businessId}`),
  updateSettings: (businessId: string, eligibilityMonths: number) =>
    api.patch<SubsidySettings>('/subsidy/settings', { businessId, eligibilityMonths }),
  listEligibility: (businessId: string) =>
    api.get<SubsidyEligibilityRow[]>(`/subsidy/eligibility?businessId=${businessId}`),
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
