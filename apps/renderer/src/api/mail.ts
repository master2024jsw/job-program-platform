import type { MailLog, MailTemplate } from '@job-program/shared';
import { api } from './client';

export type MailTemplateInput = { name: string; subject: string; body: string };

export interface SendMailInput {
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
};

export const mailApi = {
  send: (dto: SendMailInput) => api.post<MailLog[]>('/mail/send', dto),
  logs: () => api.get<MailLog[]>('/mail/logs'),
};
