import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from '../workers/worker.entity';
import { SubsidySetting } from './subsidy-setting.entity';
import { SubsidyCalculation } from './subsidy-calculation.entity';
import { SubsidyService } from './subsidy.service';
import { SubsidyController } from './subsidy.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubsidySetting, Worker, SubsidyCalculation])],
  controllers: [SubsidyController],
  providers: [SubsidyService],
})
export class SubsidyModule {}
