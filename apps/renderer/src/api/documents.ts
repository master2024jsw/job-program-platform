import type { Document } from '@job-program/shared';
import { api, downloadFile } from './client';

export interface CollectSummary {
  messagesProcessed: number;
  attachmentsSaved: number;
  errors: string[];
}

export const documentsApi = {
  list: (params?: { companyId?: string; workerId?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.companyId) query.set('companyId', params.companyId);
    if (params?.workerId) query.set('workerId', params.workerId);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return api.get<Document[]>(`/documents${qs ? `?${qs}` : ''}`);
  },
  upload: (file: File, meta: { documentType?: string; companyId?: string; workerId?: string }) => {
    const form = new FormData();
    form.append('file', file);
    if (meta.documentType) form.append('documentType', meta.documentType);
    if (meta.companyId) form.append('companyId', meta.companyId);
    if (meta.workerId) form.append('workerId', meta.workerId);
    return api.postForm<Document>('/documents', form);
  },
  analyze: (id: string) => api.post<Document>(`/documents/${id}/analyze`, {}),
  update: (
    id: string,
    dto: { reviewedData?: Record<string, unknown>; status?: string; companyId?: string; workerId?: string },
  ) => api.patch<Document>(`/documents/${id}`, dto),
  remove: (id: string) => api.delete<null>(`/documents/${id}`),
  collectAttachments: () => api.post<CollectSummary>('/mail-collector/collect', {}),
  exportReport: () => downloadFile('/documents/report/export', 'ai-review-report.xlsx'),
};
