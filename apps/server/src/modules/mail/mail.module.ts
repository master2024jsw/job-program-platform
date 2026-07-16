import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailTemplate } from './mail-template.entity';
import { MailLog } from './mail-log.entity';
import { MailTemplatesService } from './mail-templates.service';
import { MailTemplatesController } from './mail-templates.controller';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MailTemplate, MailLog, Company, Worker])],
  controllers: [MailTemplatesController, MailController],
  providers: [MailTemplatesService, MailService],
})
export class MailModule {}
