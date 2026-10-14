import type { MailAttachmentMeta, MailLog, MailTemplate } from '@job-program/shared';
import { api } from './client';

export type MailTemplateInput = { name: string; subject: string; body: string };

export interface SendMailInput {
  businessId: string;
  to?: string[];
  companyId?: string;
  workerId?: string;
  templateId?: string;
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
}

export const mailTemplatesApi = {
  list: () => api.get<MailTemplate[]>('/mail-templates'),
  create: (dto: MailTemplateInput) => api.post<MailTemplate>('/mail-templates', dto),
  update: (id: string, dto: Partial<MailTemplateInput>) => api.patch<MailTemplate>(`/mail-templates/${id}`, dto),
  remove: (id: string) => api.delete<null>(`/mail-templates/${id}`),
  addAttachments: (id: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return api.postForm<MailAttachmentMeta[]>(`/mail-templates/${id}/attachments`, form);
  },
  removeAttachment: (id: string, attachmentId: string) =>
    api.delete<null>(`/mail-templates/${id}/attachments/${attachmentId}`),
};

export interface CollectSummary {
  messagesProcessed: number;
  attachmentsSaved: number;
  errors: string[];
}

export const mailApi = {
  send: (dto: SendMailInput, files?: File[]) => {
    const form = new FormData();
    form.append('businessId', dto.businessId);
    if (dto.to) form.append('to', JSON.stringify(dto.to));
    if (dto.companyId) form.append('companyId', dto.companyId);
    if (dto.workerId) form.append('workerId', dto.workerId);
    if (dto.templateId) form.append('templateId', dto.templateId);
    if (dto.subject) form.append('subject', dto.subject);
    if (dto.body) form.append('body', dto.body);
    if (dto.variables) form.append('variables', JSON.stringify(dto.variables));
    for (const f of files ?? []) form.append('files', f);
    return api.postForm<MailLog[]>('/mail/send', form);
  },
  logs: (businessId?: string) => api.get<MailLog[]>(`/mail/logs${businessId ? `?businessId=${businessId}` : ''}`),
  collect: (filter?: { since?: string; before?: string }) => api.post<CollectSummary>('/mail-collector/collect', filter ?? {}),
};
