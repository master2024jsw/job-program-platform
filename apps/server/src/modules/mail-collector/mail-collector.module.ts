import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/company.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Worker } from '../workers/worker.entity';
import { DocumentsModule } from '../documents/documents.module';
import { MailCollectorService } from './mail-collector.service';
import { MailCollectorController } from './mail-collector.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, CompanyBusiness, Worker]), DocumentsModule],
  controllers: [MailCollectorController],
  providers: [MailCollectorService],
})
export class MailCollectorModule {}
