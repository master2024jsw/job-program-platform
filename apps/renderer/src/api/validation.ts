import type {
  CompanyLedgerFields,
  CompanyValidationResult,
  JudgmentHistoryRecord,
  SubsidyValidationResult,
  WorkerLedgerFields,
  WorkerSubsidyValidationResult,
  WorkerValidationResult,
} from '@job-program/shared';
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

  /** 기업 지원금 신청 검증 결과 조회(재실행). */
  validateSubsidy: (businessId: string, companyId: string) =>
    api.get<SubsidyValidationResult>(`/validation/subsidy/${companyId}?businessId=${encodeURIComponent(businessId)}`),

  /** 담당자 승인 → SubsidyCalculation 저장 + HUMAN 이력. */
  approveSubsidy: (companyId: string, businessId: string) =>
    api.post<SubsidyValidationResult>(`/validation/subsidy/${companyId}/approve`, { businessId, companyId }),

  /** 근로자 1명 기준 지원금 검증 (참여자·지원금 탭). */
  workerSubsidy: (companyId: string, workerId: string, businessId: string) =>
    api.get<WorkerSubsidyValidationResult>(
      `/validation/subsidy/${companyId}/worker/${workerId}?businessId=${encodeURIComponent(businessId)}`,
    ),

  subsidyHistory: (companyId: string) => api.get<JudgmentHistoryRecord[]>(`/validation/subsidy/${companyId}/history`),
};
