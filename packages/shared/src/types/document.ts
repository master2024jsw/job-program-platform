export enum DocumentAnalysisStatus {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  ANALYZED = 'ANALYZED',
  FAILED = 'FAILED',
  REVIEWED = 'REVIEWED',
}

/** 문서 1.4절 서류유형 코드. Document.documentType은 이 코드값으로 관리한다 (D단계에서 실제 적용). */
export const DOCUMENT_TYPE_CODES = [
  'COMPANY_APPLICATION',
  'BUSINESS_REGISTRATION',
  'PARTICIPANT_APPLICATION',
  'PRIVACY_CONSENT',
  'HEALTH_INSURANCE_HISTORY',
  'PAYSLIP',
  'EMPLOYMENT_CONTRACT',
  'ATTENDANCE_RECORD',
  'OTHER',
] as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number];

export interface DocumentTypeDef {
  code: DocumentTypeCode;
  label: string;
}

export type RequiredDocumentStageTarget = 'COMPANY' | 'WORKER';

export interface RequiredDocumentStage {
  stage: string;
  label: string;
  target: RequiredDocumentStageTarget;
  documents: DocumentTypeCode[];
}

/** 사업유형(typeCode)별 필수서류 정의. apps/server/resources/required-documents/*.json의 구조와 일치해야 한다. */
export interface RequiredDocumentsDef {
  typeCode: string;
  guidelineYear: number;
  source: string;
  stages: RequiredDocumentStage[];
}

export interface Document {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType?: string | null;
  companyId?: string | null;
  workerId?: string | null;
  source: 'UPLOAD' | 'IMAP';
  senderEmail?: string | null;
  status: DocumentAnalysisStatus;
  extractedData?: Record<string, unknown> | null;
  reviewedData?: Record<string, unknown> | null;
  errorMessage?: string | null;
  analyzedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
