import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../documents/document.entity';
import { JudgmentHistory } from './judgment-history.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { SubsidyCalculation } from '../subsidy/subsidy-calculation.entity';
import { CompaniesModule } from '../companies/companies.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { RequiredDocumentsModule } from '../required-documents/required-documents.module';
import { WorkersModule } from '../workers/workers.module';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { WorkerValidationService } from './worker-validation.service';
import { SubsidyValidationService } from './subsidy-validation.service';
import { DomainValidationEngine } from './domain-validation.engine';
import { ValidationRulesService } from './validation-rules.service';
import { JobClassificationService } from './job-classification.service';
import { JudgmentHistoryService } from './judgment-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, JudgmentHistory, CompanyBusiness, SubsidyCalculation]),
    CompaniesModule,
    BusinessesModule,
    RequiredDocumentsModule,
    WorkersModule,
  ],
  controllers: [ValidationController],
  providers: [
    ValidationService,
    WorkerValidationService,
    SubsidyValidationService,
    DomainValidationEngine,
    ValidationRulesService,
    JobClassificationService,
    JudgmentHistoryService,
  ],
  exports: [ValidationService, WorkerValidationService, SubsidyValidationService],
})
export class ValidationModule {}
