import type { Participation, ParticipationWithNames } from '@job-program/shared';
import { api } from './client';

export type ParticipationInput = {
  businessId: string;
  companyBusinessId: string;
  workerId: string;
  participationType?: string | null;
  position?: string | null;
  hireDate?: string | null;
  internEndDate?: string | null;
  resignDate?: string | null;
  continuousHireDate?: string | null;
  salary?: number | null;
  memo?: string | null;
  allowDuplicate?: boolean;
};

export const participationsApi = {
  /** companyId 를 주면 그 기업의 근로자만. 생략하면 사업 전체. */
  list: (businessId: string, companyId?: string) => {
    const q = new URLSearchParams({ businessId });
    if (companyId) q.set('companyId', companyId);
    return api.get<ParticipationWithNames[]>(`/participations?${q.toString()}`);
  },
  get: (businessId: string, id: string) =>
    api.get<Participation>(`/participations/${id}?businessId=${encodeURIComponent(businessId)}`),
  create: (dto: ParticipationInput) => api.post<Participation>('/participations', dto),
  update: (businessId: string, id: string, dto: Partial<ParticipationInput>) =>
    api.patch<Participation>(`/participations/${id}?businessId=${encodeURIComponent(businessId)}`, dto),
  remove: (businessId: string, id: string) =>
    api.delete<null>(`/participations/${id}?businessId=${encodeURIComponent(businessId)}`),
};
