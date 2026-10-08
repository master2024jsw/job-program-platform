export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum ContractType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  DAILY = 'DAILY',
}

export enum WorkerStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  RESIGNED = 'RESIGNED',
}

/** 근로자 신청 진행 단계 — 업무 프로세스 상에서 어느 단계인지 */
export enum ApplicationStatus {
  UNDER_REVIEW = 'UNDER_REVIEW',           // 근로자 신청검토중
  APPLICATION_COMPLETE = 'APPLICATION_COMPLETE', // 근로자신청완료
  SUBSIDY_GUIDANCE = 'SUBSIDY_GUIDANCE',   // 지원금 안내
}

export interface Worker {
  id: string;
  businessId?: string | null;
  name: string;
  birthDate: string;
  gender?: Gender | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  companyId?: string | null;
  position?: string | null;
  contractType?: ContractType | null;
  hireDate?: string | null;
  resignDate?: string | null;
  salary?: number | null;
  status: WorkerStatus;
  applicationStatus?: ApplicationStatus | null;
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}
