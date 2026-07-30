import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobAnnouncement } from './announcement.entity';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { MoelDaeguCollectorService } from './moel-daegu-collector.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobAnnouncement])],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, MoelDaeguCollectorService],
})
export class AnnouncementsModule {}
