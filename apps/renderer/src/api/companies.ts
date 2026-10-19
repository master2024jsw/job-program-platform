import type { Company, CompanyBusiness, CompanyRow, CompanyStage, CompanyStageChange } from '@job-program/shared';
import { api, downloadFile, type ImportSummary } from './client';

export type CompanyInput = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'source'>;

export interface UpsertCompanyBusinessInput {
  businessId: string;
  participationType?: string;
  plannedHeadcount?: number;
  generalTypeHeadcount?: number;
  intergenerationalTypeHeadcount?: number;
  agreementSentDate?: string;
  agreementDate?: string;
  agreementConcluded?: boolean;
  businessPlanRegistered?: boolean;
  documentGuideSent?: boolean;
  participantApplied?: boolean;
}

export interface DedupeGroup {
  matchType: 'businessRegistrationNumber' | 'name';
  matchValue: string;
  keeper: Company;
  duplicates: Company[];
}

export interface ContactNormalizePreviewRow {
  id: string;
  name: string;
  field: 'phone' | 'fax' | 'email';
  before: string;
  after: string;
}

export const companiesApi = {
  /** 단계 수동 변경. 되돌리기도 가능하며 사유가 이력에 남는다. */
  setStage: (companyId: string, businessId: string, stage: CompanyStage, reason?: string) =>
    api.patch<CompanyBusiness>(
      `/companies/${companyId}/stage?businessId=${encodeURIComponent(businessId)}`,
      { stage, reason },
    ),
  stageHistory: (companyId: string, businessId: string) =>
    api.get<CompanyStageChange[]>(
      `/companies/${companyId}/stage/history?businessId=${encodeURIComponent(businessId)}`,
    ),

  list: (params?: { keyword?: string; businessId?: string; stage?: CompanyStage }) => {
    const query = new URLSearchParams();
    if (params?.keyword) query.set('keyword', params.keyword);
    if (params?.businessId) query.set('businessId', params.businessId);
    if (params?.stage) query.set('stage', params.stage);
    const qs = query.toString();
    return api.get<CompanyRow[]>(`/companies${qs ? `?${qs}` : ''}`);
  },
  create: (dto: Partial<CompanyInput>) => api.post<Company>('/companies', dto),
  update: (id: string, dto: Partial<CompanyInput>) => api.patch<Company>(`/companies/${id}`, dto),
  /** force=true 면 연결된 참여기록·지원금신청까지 함께 지운다. */
  remove: (id: string, force = false) =>
    api.delete<{ deletedParticipations: number; deletedClaims: number }>(
      `/companies/${id}${force ? '?force=true' : ''}`,
    ),
  upsertBusiness: (id: string, dto: UpsertCompanyBusinessInput) =>
    api.put<CompanyBusiness>(`/companies/${id}/business`, dto),
  exportExcel: (businessId?: string) =>
    downloadFile(`/companies/export${businessId ? `?businessId=${businessId}` : ''}`, 'companies.xlsx'),
  importExcel: (file: File, businessId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (businessId) form.append('businessId', businessId);
    return api.postForm<ImportSummary>('/companies/import', form);
  },
  previewDedupe: () => api.get<DedupeGroup[]>('/companies/dedupe/preview'),
  confirmDedupe: () => api.post<{ merged: number }>('/companies/dedupe/confirm', {}),
  previewNormalizeContacts: () => api.get<ContactNormalizePreviewRow[]>('/companies/normalize-contacts/preview'),
  confirmNormalizeContacts: () => api.post<{ updated: number }>('/companies/normalize-contacts/confirm', {}),
};
