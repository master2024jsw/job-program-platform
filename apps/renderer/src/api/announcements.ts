import type { AnnouncementStatus, JobAnnouncementRow } from '@job-program/shared';
import { api } from './client';

export interface AnnouncementInput {
  title: string;
  agency?: string;
  sourceUrl?: string;
  publishedDate?: string;
  category?: string;
  typeCode?: string;
  qualification?: string;
  applicationStartDate?: string;
  deadline?: string;
  department?: string;
  contact?: string;
  memo?: string;
}

export interface MoelCollectSummary {
  keyword: string;
  found: number;
  created: number;
  skipped: number;
}

export interface AnnouncementListParams {
  status?: AnnouncementStatus;
  sortBy?: 'deadline' | 'publishedDate' | 'agency' | 'title';
  sortOrder?: 'asc' | 'desc';
  keyword?: string;
  bookmarkedOnly?: boolean;
}

export const announcementsApi = {
  list: (params?: AnnouncementListParams) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params?.keyword) query.set('keyword', params.keyword);
    if (params?.bookmarkedOnly) query.set('bookmarkedOnly', 'true');
    const qs = query.toString();
    return api.get<JobAnnouncementRow[]>(`/announcements${qs ? `?${qs}` : ''}`);
  },
  create: (dto: AnnouncementInput) => api.post<JobAnnouncementRow>('/announcements', dto),
  update: (id: string, dto: Partial<AnnouncementInput> & { isChecked?: boolean; isBookmarked?: boolean }) =>
    api.patch<JobAnnouncementRow>(`/announcements/${id}`, dto),
  remove: (id: string) => api.delete<null>(`/announcements/${id}`),
  collectMoelDaegu: () => api.post<MoelCollectSummary>('/announcements/collect/moel-daegu'),
};
