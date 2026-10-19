import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from '../workers/worker.entity';
import { Participation } from '../participations/participation.entity';
import { SubsidySetting } from './subsidy-setting.entity';
import { SubsidyCalculation } from './subsidy-calculation.entity';
import { SubsidyClaim } from './subsidy-claim.entity';
import { SubsidyService } from './subsidy.service';
import { SubsidyController } from './subsidy.controller';
import { SubsidyClaimsService } from './subsidy-claims.service';
import { SubsidyClaimsController } from './subsidy-claims.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { MailModule } from '../mail/mail.module';

/**
 * 기존 SubsidyService/SubsidyCalculation 은 그대로 둔다 (설계서 §11 — 레거시 보존).
 * 새 산정은 SubsidyClaimsService 가 정책 원장 기반으로 수행한다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubsidySetting,
      Worker,
      SubsidyCalculation,
      SubsidyClaim,
      Participation,
    ]),
    BusinessesModule,
    MailModule,
  ],
  controllers: [SubsidyController, SubsidyClaimsController],
  providers: [SubsidyService, SubsidyClaimsService],
  exports: [SubsidyClaimsService],
})
export class SubsidyModule {}
