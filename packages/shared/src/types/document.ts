export enum DocumentAnalysisStatus {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  ANALYZED = 'ANALYZED',
  FAILED = 'FAILED',
  REVIEWED = 'REVIEWED',
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
