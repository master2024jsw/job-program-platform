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
  'OPERATION_PLAN',
  'WORKPLACE_INSURANCE',
  'BUSINESS_REGISTRATION',
  'PARTICIPANT_APPLICATION',
  'PRIVACY_CONSENT',
  'HEALTH_INSURANCE_HISTORY',
  'PAYSLIP',
  'EMPLOYMENT_CONTRACT',
  'ATTENDANCE_RECORD',
  // 5단계: 근로자신청 서류유형 (R-201~210)
  'WORKER_APPLICATION',
  'RESIDENT_ABSTRACT',
  'EMPLOYMENT_INSURANCE_HISTORY',
  'ELIGIBILITY_CONFIRM',
  'LABOR_CONTRACT',
  'EDUCATION_LEDGER',
  // 6단계: 지원금신청 서류유형 (R-301~309)
  'SUBSIDY_APPLICATION',
  'SUBSIDY_CALCULATION',
  'INSURANCE_ROSTER',
  'PAYROLL',
  'SALARY_TRANSFER',
  'BANK_ACCOUNT_COPY',
  // 가상 컨텍스트: 서비스에서 검증엔진으로 정보를 주입할 때 사용 (실제 파일이 아님)
  'COMPANY_CONTEXT',
  'WORKER_CONTEXT',
  'OTHER',
] as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number];

export interface DocumentTypeDef {
  code: DocumentTypeCode;
  label: string;
}

export type RequiredDocumentStageTarget = 'COMPANY' | 'WORKER' | 'SUBSIDY';

export interface RequiredDocumentStage {
  stage: string;
  label: string;
  target: RequiredDocumentStageTarget;
  documents: DocumentTypeCode[];
  /** 선택서류: 없어도 MISSING이 아니나 있으면 관련 규칙 수행 */
  optional?: DocumentTypeCode[];
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
  businessId?: string | null;
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
