export type AnnouncementStatus = 'ONGOING' | 'DEADLINE_SOON' | 'CLOSED' | 'UNSPECIFIED';

export interface JobAnnouncement {
  id: string;
  title: string;
  agency?: string | null;
  sourceUrl?: string | null;
  publishedDate?: string | null;
  category?: string | null;
  typeCode?: string | null;
  qualification?: string | null;
  applicationStartDate?: string | null;
  deadline?: string | null;
  department?: string | null;
  contact?: string | null;
  source: 'manual' | 'crawl';
  isChecked: boolean;
  isBookmarked: boolean;
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 목록 조회 시 마감일 기준으로 파생되는 D-day/상태가 더해진 행 */
export interface JobAnnouncementRow extends JobAnnouncement {
  daysUntilDeadline: number | null;
  status: AnnouncementStatus;
}
