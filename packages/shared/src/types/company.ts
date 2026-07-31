export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface Company {
  id: string;
  name: string;
  businessRegistrationNumber?: string | null;
  representativeName?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  industryType?: string | null;
  address?: string | null;
  status: CompanyStatus;
  source: 'excel' | 'manual' | 'api';
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyBusiness {
  id: string;
  companyId: string;
  businessId: string;
  participationType?: string | null;
  plannedHeadcount?: number | null;
  generalTypeHeadcount?: number | null;
  intergenerationalTypeHeadcount?: number | null;
  agreementSentDate?: string | null;
  agreementDate?: string | null;
  agreementConcluded: boolean;
  businessPlanRegistered: boolean;
  documentGuideSent: boolean;
  participantApplied: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 기업 목록 조회 시 현재 선택된 사업의 CompanyBusiness와 연락가능 여부가 함께 내려온다. */
export interface CompanyRow extends Company {
  companyBusiness: CompanyBusiness | null;
  contactable: boolean;
}
