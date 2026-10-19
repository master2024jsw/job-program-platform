import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from './worker.entity';
import { Company } from '../companies/company.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { SubsidyCalculation } from '../subsidy/subsidy-calculation.entity';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { Participation } from '../participations/participation.entity';
import { SubsidyClaim } from '../subsidy/subsidy-claim.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Worker, Company, CompanyBusiness, SubsidyCalculation, Participation, SubsidyClaim]), BusinessesModule],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
