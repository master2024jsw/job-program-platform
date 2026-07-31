import type { Business } from '@job-program/shared';
import { api } from './client';

export interface CreateBusinessInput {
  name: string;
  typeCode: string;
  baseYear: number;
}

export const businessesApi = {
  list: () => api.get<Business[]>('/businesses'),
  create: (dto: CreateBusinessInput) => api.post<Business>('/businesses', dto),
};
