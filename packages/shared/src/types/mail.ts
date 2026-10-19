import type { CompanyStage } from './company-stage';

export enum MailLogStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface MailAttachmentMeta {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSize: number;
  createdAt: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  attachments?: MailAttachmentMeta[];
  createdAt: string;
  updatedAt: string;
  /** 이 메일을 보내면 기업 단계를 여기까지 올린다. null 이면 바꾸지 않는다. */
  advanceToStage?: CompanyStage | null;
}

export interface MailLog {
  id: string;
  businessId?: string | null;
  to: string;
  subject: string;
  body: string;
  status: MailLogStatus;
  errorMessage?: string | null;
  templateId?: string | null;
  createdAt: string;
}
