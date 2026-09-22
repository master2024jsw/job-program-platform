export enum MailLogStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
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
