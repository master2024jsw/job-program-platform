import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';
import { DocumentsModule } from '../documents/documents.module';
import { MailCollectorService } from './mail-collector.service';
import { MailCollectorController } from './mail-collector.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, Worker]), DocumentsModule],
  controllers: [MailCollectorController],
  providers: [MailCollectorService],
})
export class MailCollectorModule {}
