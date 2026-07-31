import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { JobAnnouncement } from './announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

const DEADLINE_SOON_DAYS = 7;

export type AnnouncementStatus = 'ONGOING' | 'DEADLINE_SOON' | 'CLOSED' | 'UNSPECIFIED';

export interface JobAnnouncementRow {
  id: string;
  title: string;
  agency: string | null;
  sourceUrl: string | null;
  publishedDate: string | null;
  category: string | null;
  typeCode: string | null;
  qualification: string | null;
  applicationStartDate: string | null;
  deadline: string | null;
  department: string | null;
  contact: string | null;
  source: 'manual' | 'crawl';
  isChecked: boolean;
  isBookmarked: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  daysUntilDeadline: number | null;
  status: AnnouncementStatus;
}

export interface AnnouncementListFilters {
  status?: AnnouncementStatus;
  sortBy?: 'deadline' | 'publishedDate' | 'agency' | 'title';
  sortOrder?: 'asc' | 'desc';
  keyword?: string;
  bookmarkedOnly?: boolean;
}

function todayLocalDateString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function deriveStatus(
  deadline: string | null,
  today: string,
): { daysUntilDeadline: number | null; status: AnnouncementStatus } {
  if (!deadline) return { daysUntilDeadline: null, status: 'UNSPECIFIED' };
  const days = daysBetween(today, deadline);
  if (days < 0) return { daysUntilDeadline: days, status: 'CLOSED' };
  if (days <= DEADLINE_SOON_DAYS) return { daysUntilDeadline: days, status: 'DEADLINE_SOON' };
  return { daysUntilDeadline: days, status: 'ONGOING' };
}

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(JobAnnouncement)
    private readonly announcementsRepository: Repository<JobAnnouncement>,
  ) {}

  create(dto: CreateAnnouncementDto): Promise<JobAnnouncement> {
    const announcement = this.announcementsRepository.create(dto);
    return this.announcementsRepository.save(announcement);
  }

  async findAll(filters?: AnnouncementListFilters): Promise<JobAnnouncementRow[]> {
    const where = filters?.keyword
      ? [{ title: Like(`%${filters.keyword}%`) }, { agency: Like(`%${filters.keyword}%`) }]
      : {};
    const announcements = await this.announcementsRepository.find({ where, order: { createdAt: 'DESC' } });

    const today = todayLocalDateString();
    let rows: JobAnnouncementRow[] = announcements.map((a) => {
      const { daysUntilDeadline, status } = deriveStatus(a.deadline ?? null, today);
      return {
        id: a.id,
        title: a.title,
        agency: a.agency ?? null,
        sourceUrl: a.sourceUrl ?? null,
        publishedDate: a.publishedDate ?? null,
        category: a.category ?? null,
        typeCode: a.typeCode ?? null,
        qualification: a.qualification ?? null,
        applicationStartDate: a.applicationStartDate ?? null,
        deadline: a.deadline ?? null,
        department: a.department ?? null,
        contact: a.contact ?? null,
        source: a.source,
        isChecked: a.isChecked,
        isBookmarked: a.isBookmarked,
        memo: a.memo ?? null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        daysUntilDeadline,
        status,
      };
    });

    if (filters?.status) {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters?.bookmarkedOnly) {
      rows = rows.filter((r) => r.isBookmarked);
    }

    const sortBy = filters?.sortBy ?? 'deadline';
    const sortOrder = filters?.sortOrder ?? 'asc';
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'deadline') {
        // 마감일 없는 공고는 항상 뒤로 보낸다.
        if (a.deadline === null && b.deadline === null) cmp = 0;
        else if (a.deadline === null) cmp = 1;
        else if (b.deadline === null) cmp = -1;
        else cmp = a.deadline.localeCompare(b.deadline);
      } else if (sortBy === 'publishedDate') {
        cmp = (a.publishedDate ?? '').localeCompare(b.publishedDate ?? '');
      } else if (sortBy === 'agency') {
        cmp = (a.agency ?? '').localeCompare(b.agency ?? '');
      } else {
        cmp = a.title.localeCompare(b.title);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return rows;
  }

  async findOne(id: string): Promise<JobAnnouncement> {
    const announcement = await this.announcementsRepository.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException(`공고(${id})를 찾을 수 없습니다.`);
    }
    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<JobAnnouncement> {
    const announcement = await this.findOne(id);
    Object.assign(announcement, dto);
    return this.announcementsRepository.save(announcement);
  }

  async remove(id: string): Promise<void> {
    const announcement = await this.findOne(id);
    await this.announcementsRepository.remove(announcement);
  }
}
