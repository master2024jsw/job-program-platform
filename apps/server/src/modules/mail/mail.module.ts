import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailTemplate } from './mail-template.entity';
import { MailTemplateAttachment } from './mail-template-attachment.entity';
import { MailLog } from './mail-log.entity';
import { MailTemplatesService } from './mail-templates.service';
import { MailTemplatesController } from './mail-templates.controller';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';
import { Business } from '../businesses/business.entity';
import { Institution } from '../auth/institution.entity';
import { BusinessesModule } from '../businesses/businesses.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailTemplate, MailTemplateAttachment, MailLog, Company, Worker, Business, Institution]),
    CompaniesModule,
    BusinessesModule,
  ],
  controllers: [MailTemplatesController, MailController],
  providers: [MailTemplatesService, MailService],
  exports: [MailService, MailTemplatesService],
})
export class MailModule {}
