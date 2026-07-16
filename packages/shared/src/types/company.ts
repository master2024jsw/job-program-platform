export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface Company {
  id: string;
  name: string;
  businessRegistrationNumber: string;
  representativeName?: string | null;
  industryType?: string | null;
  address?: string | null;
  phone?: string | null;
  contactManagerName?: string | null;
  contactManagerPhone?: string | null;
  contactManagerEmail?: string | null;
  status: CompanyStatus;
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}
