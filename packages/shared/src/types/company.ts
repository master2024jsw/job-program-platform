import type { CompanyStage } from './company-stage';

export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum RecruitStatus {
  PROSPECT = 'PROSPECT',
  CONTACTED = 'CONTACTED',
  APPLIED = 'APPLIED',
  VERIFIED = 'VERIFIED',
}

export const RECRUIT_STATUS_ORDER: Record<RecruitStatus, number> = {
  [RecruitStatus.PROSPECT]: 0,
  [RecruitStatus.CONTACTED]: 1,
  [RecruitStatus.APPLIED]: 2,
  [RecruitStatus.VERIFIED]: 3,
};

export const RECRUIT_STATUS_LABEL: Record<RecruitStatus, string> = {
  [RecruitStatus.PROSPECT]: '모집대상',
  [RecruitStatus.CONTACTED]: '안내발송',
  [RecruitStatus.APPLIED]: '신청접수',
  [RecruitStatus.VERIFIED]: '검증완료',
};

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
  recruitStatus: RecruitStatus;
  source: 'excel' | 'manual' | 'api';
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyBusiness {
  id: string;
  companyId: string;
  businessId: string;
  /** 통일된 진행 단계. 사업별로 따로 관리된다. */
  stage: CompanyStage;
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
  recruitJobTitle?: string | null;
  recruitJobCode?: string | null;
  jobEligibility?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 기업 목록 조회 시 현재 선택된 사업의 CompanyBusiness 가 함께 내려온다.
 * `stage` 는 목록 정렬·필터에 쓰려고 꺼내 둔 것이고, 원본은 companyBusiness.stage 다.
 * 사업에 아직 참여하지 않은 기업은 companyBusiness 가 null 이고 stage 는 PROSPECT 로 본다.
 */
export interface CompanyRow extends Company {
  companyBusiness: CompanyBusiness | null;
  stage: CompanyStage;
}
