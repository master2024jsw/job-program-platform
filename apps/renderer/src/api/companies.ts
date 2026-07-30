import type { Company } from '@job-program/shared';
import { api, downloadFile, type ImportSummary } from './client';

export type CompanyInput = Omit<Company, 'id' | 'createdAt' | 'updatedAt'>;

export const companiesApi = {
  list: (keyword?: string) =>
    api.get<Company[]>(`/companies${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
  create: (dto: Partial<CompanyInput>) => api.post<Company>('/companies', dto),
  update: (id: string, dto: Partial<CompanyInput>) => api.patch<Company>(`/companies/${id}`, dto),
  remove: (id: string) => api.delete<null>(`/companies/${id}`),
  exportExcel: () => downloadFile('/companies/export', 'companies.xlsx'),
  importExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<ImportSummary>('/companies/import', form);
  },
};
