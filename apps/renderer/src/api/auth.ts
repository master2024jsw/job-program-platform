import type { SessionUser, SetupStatus } from '@job-program/shared';
import { api } from './client';

export interface SetupInput {
  institutionName: string;
  adminLoginId: string;
  adminPassword: string;
  adminName: string;
  businessName: string;
  businessTypeCode: string;
  businessBaseYear: number;
}

export interface LoginInput {
  loginId: string;
  password: string;
  keepLoggedIn?: boolean;
}

export const authApi = {
  setupStatus: () => api.get<SetupStatus>('/auth/setup-status'),
  setup: (dto: SetupInput) => api.post<SessionUser>('/auth/setup', dto),
  login: (dto: LoginInput) => api.post<SessionUser>('/auth/login', dto),
  logout: () => api.post<null>('/auth/logout', {}),
  me: () => api.get<SessionUser>('/auth/me'),
};
