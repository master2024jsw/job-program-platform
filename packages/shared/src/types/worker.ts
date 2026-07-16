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

export interface Worker {
  id: string;
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
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}
