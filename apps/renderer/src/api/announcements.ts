import type { JobAnnouncement } from '@job-program/shared';
import { api } from './client';

export interface AnnouncementInput {
  title: string;
  agency?: string;
  sourceUrl?: string;
  publishedDate?: string;
  category?: string;
  memo?: string;
}

export interface MoelCollectSummary {
  keyword: string;
  found: number;
  created: number;
  skipped: number;
}

export const announcementsApi = {
  list: () => api.get<JobAnnouncement[]>('/announcements'),
  create: (dto: AnnouncementInput) => api.post<JobAnnouncement>('/announcements', dto),
  update: (id: string, dto: Partial<AnnouncementInput> & { isChecked?: boolean }) =>
    api.patch<JobAnnouncement>(`/announcements/${id}`, dto),
  remove: (id: string) => api.delete<null>(`/announcements/${id}`),
  collectMoelDaegu: () => api.post<MoelCollectSummary>('/announcements/collect/moel-daegu'),
};
