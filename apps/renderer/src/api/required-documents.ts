import type { DocumentTypeDef, RequiredDocumentsDef } from '@job-program/shared';
import { api } from './client';

export const requiredDocumentsApi = {
  documentTypes: () => api.get<DocumentTypeDef[]>('/required-documents/document-types'),
  findByTypeCode: (typeCode: string) =>
    api.get<RequiredDocumentsDef | null>(`/required-documents?typeCode=${encodeURIComponent(typeCode)}`),
};
