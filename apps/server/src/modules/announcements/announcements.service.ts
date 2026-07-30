import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobAnnouncement } from './announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

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

  findAll(): Promise<JobAnnouncement[]> {
    return this.announcementsRepository.find({ order: { publishedDate: 'DESC', createdAt: 'DESC' } });
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
