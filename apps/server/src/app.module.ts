import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { WorkersModule } from './modules/workers/workers.module';
import { MailModule } from './modules/mail/mail.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { MailCollectorModule } from './modules/mail-collector/mail-collector.module';
import { SubsidyModule } from './modules/subsidy/subsidy.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CompaniesModule,
    WorkersModule,
    MailModule,
    DocumentsModule,
    MailCollectorModule,
    SubsidyModule,
    AnnouncementsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
