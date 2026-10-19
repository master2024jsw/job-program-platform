import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './company.entity';
import { CompanyBusiness } from './company-business.entity';
import { CompanyStageChange } from './company-stage-change.entity';
import { Worker } from '../workers/worker.entity';
import { CompaniesService } from './companies.service';
import { CompanyStageService } from './company-stage.service';
import { CompaniesController } from './companies.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { Participation } from '../participations/participation.entity';
import { SubsidyClaim } from '../subsidy/subsidy-claim.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Company, CompanyBusiness, CompanyStageChange, Worker, Participation, SubsidyClaim]), BusinessesModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyStageService],
  exports: [CompaniesService, CompanyStageService],
})
export class CompaniesModule {}
