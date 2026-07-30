import { api } from './client';

export interface SubsidySettings {
  id: string;
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
  workerId: string;
  periodLabel: string;
  workedDays: number;
}

export const subsidyApi = {
  getSettings: () => api.get<SubsidySettings>('/subsidy/settings'),
  updateSettings: (eligibilityMonths: number) =>
    api.patch<SubsidySettings>('/subsidy/settings', { eligibilityMonths }),
  listEligibility: () => api.get<SubsidyEligibilityRow[]>('/subsidy/eligibility'),
  calculate: (dto: CreateSubsidyCalculationInput) =>
    api.post<SubsidyCalculationRow>('/subsidy/calculations', dto),
  listCalculations: (workerId?: string) =>
    api.get<SubsidyCalculationRow[]>(`/subsidy/calculations${workerId ? `?workerId=${workerId}` : ''}`),
  removeCalculation: (id: string) => api.delete<null>(`/subsidy/calculations/${id}`),
};
