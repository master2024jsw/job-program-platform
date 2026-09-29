import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../documents/document.entity';
import { JudgmentHistory } from './judgment-history.entity';
import { CompaniesModule } from '../companies/companies.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { RequiredDocumentsModule } from '../required-documents/required-documents.module';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { DomainValidationEngine } from './domain-validation.engine';
import { ValidationRulesService } from './validation-rules.service';
import { JobClassificationService } from './job-classification.service';
import { JudgmentHistoryService } from './judgment-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, JudgmentHistory]),
    CompaniesModule,
    BusinessesModule,
    RequiredDocumentsModule,
  ],
  controllers: [ValidationController],
  providers: [
    ValidationService,
    DomainValidationEngine,
    ValidationRulesService,
    JobClassificationService,
    JudgmentHistoryService,
  ],
  exports: [ValidationService],
})
export class ValidationModule {}
