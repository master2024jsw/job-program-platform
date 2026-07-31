import type { Company, CompanyBusiness, CompanyRow } from '@job-program/shared';
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
  list: (params?: { keyword?: string; businessId?: string; contactableOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.keyword) query.set('keyword', params.keyword);
    if (params?.businessId) query.set('businessId', params.businessId);
    if (params?.contactableOnly) query.set('contactableOnly', 'true');
    const qs = query.toString();
    return api.get<CompanyRow[]>(`/companies${qs ? `?${qs}` : ''}`);
  },
  create: (dto: Partial<CompanyInput>) => api.post<Company>('/companies', dto),
  update: (id: string, dto: Partial<CompanyInput>) => api.patch<Company>(`/companies/${id}`, dto),
  remove: (id: string) => api.delete<null>(`/companies/${id}`),
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
