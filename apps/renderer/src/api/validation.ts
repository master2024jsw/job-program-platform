import type { CompanyLedgerFields, CompanyValidationResult, JudgmentHistoryRecord, WorkerLedgerFields, WorkerValidationResult } from '@job-program/shared';
import { api } from './client';

export const validationApi = {
  /** 기업 신청 검증 결과 조회(재실행). */
  validateCompany: (businessId: string, companyId: string) =>
    api.get<CompanyValidationResult>(`/validation/company/${companyId}?businessId=${encodeURIComponent(businessId)}`),

  /** 담당자 승인 → 대장 반영 + 정정 이력. */
  approveCompany: (companyId: string, businessId: string, reviewed: Partial<CompanyLedgerFields>) =>
    api.post<CompanyValidationResult>(`/validation/company/${companyId}/approve`, { businessId, reviewed }),

  history: (companyId: string) => api.get<JudgmentHistoryRecord[]>(`/validation/company/${companyId}/history`),

  /** 근로자 신청 검증 결과 조회(재실행). */
  validateWorker: (businessId: string, companyId: string, workerId: string) =>
    api.get<WorkerValidationResult>(`/validation/worker/${workerId}?businessId=${encodeURIComponent(businessId)}&companyId=${encodeURIComponent(companyId)}`),

  /** 담당자 승인 → 근로자 대장 반영 + 정정 이력. */
  approveWorker: (workerId: string, businessId: string, companyId: string, reviewed: Partial<WorkerLedgerFields>) =>
    api.post<WorkerValidationResult>(`/validation/worker/${workerId}/approve`, { businessId, companyId, reviewed }),

  workerHistory: (workerId: string) => api.get<JudgmentHistoryRecord[]>(`/validation/worker/${workerId}/history`),
};
