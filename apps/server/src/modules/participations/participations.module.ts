import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Participation } from './participation.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Worker } from '../workers/worker.entity';
import { ParticipationsService } from './participations.service';
import { ParticipationsController } from './participations.controller';
import { BusinessesModule } from '../businesses/businesses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Participation, CompanyBusiness, Worker]),
    BusinessesModule,
  ],
  controllers: [ParticipationsController],
  providers: [ParticipationsService],
  exports: [ParticipationsService],
})
export class ParticipationsModule {}
