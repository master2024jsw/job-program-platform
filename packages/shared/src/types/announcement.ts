export interface JobAnnouncement {
  id: string;
  title: string;
  agency?: string | null;
  sourceUrl?: string | null;
  publishedDate?: string | null;
  category?: string | null;
  isChecked: boolean;
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
}
