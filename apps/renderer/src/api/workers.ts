import type { Worker } from '@job-program/shared';
import { api, downloadFile, type ImportSummary } from './client';

export type WorkerInput = Omit<Worker, 'id' | 'createdAt' | 'updatedAt'>;

export const workersApi = {
  list: (params?: { keyword?: string; companyId?: string; businessId?: string }) => {
    const query = new URLSearchParams();
    if (params?.keyword) query.set('keyword', params.keyword);
    if (params?.companyId) query.set('companyId', params.companyId);
    if (params?.businessId) query.set('businessId', params.businessId);
    const qs = query.toString();
    return api.get<Worker[]>(`/workers${qs ? `?${qs}` : ''}`);
  },
  create: (dto: Partial<WorkerInput>) => api.post<Worker>('/workers', dto),
  update: (id: string, dto: Partial<WorkerInput>) => api.patch<Worker>(`/workers/${id}`, dto),
  /** force=true 면 연결된 참여기록·지원금신청까지 함께 지운다. */
  remove: (id: string, force = false) =>
    api.delete<{ deletedParticipations: number; deletedClaims: number }>(
      `/workers/${id}${force ? '?force=true' : ''}`,
    ),
  exportExcel: () => downloadFile('/workers/export', 'workers.xlsx'),
  importExcel: (file: File, businessId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (businessId) form.append('businessId', businessId);
    return api.postForm<ImportSummary>('/workers/import', form);
  },
};
