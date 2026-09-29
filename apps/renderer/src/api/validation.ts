import type { CompanyLedgerFields, CompanyValidationResult, JudgmentHistoryRecord } from '@job-program/shared';
import { api } from './client';

export const validationApi = {
  /** 기업 신청 검증 결과 조회(재실행). */
  validateCompany: (businessId: string, companyId: string) =>
    api.get<CompanyValidationResult>(`/validation/company/${companyId}?businessId=${encodeURIComponent(businessId)}`),

  /** 담당자 승인 → 대장 반영 + 정정 이력. */
  approveCompany: (companyId: string, businessId: string, reviewed: Partial<CompanyLedgerFields>) =>
    api.post<CompanyValidationResult>(`/validation/company/${companyId}/approve`, { businessId, reviewed }),

  history: (companyId: string) => api.get<JudgmentHistoryRecord[]>(`/validation/company/${companyId}/history`),
};
