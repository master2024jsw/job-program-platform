import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  COMPANY_STAGE_LABEL,
  COMPANY_STAGE_ORDER,
  CompanyStage,
  type SessionUser,
} from '@job-program/shared';
import { CompanyBusiness } from './company-business.entity';
import { CompanyStageChange } from './company-stage-change.entity';

/**
 * 기업 진행 단계의 단일 책임 지점.
 *
 * 단계는 **여기서만** 바뀐다. 서류분석·검증승인·메일발송 어디서든 이 서비스를 통한다.
 * 설계서 §8.2 #7 — 상태 변경은 전용 명령 메서드를 통하고 일반 PATCH 로 우회할 수 없게 한다.
 *
 * 단계가 올라갈 때 참여기업 관리대장(공문 양식)에 필요한 불리언도 같이 켜 준다.
 * 화면에는 단계 하나만 보이지만 대장 출력은 그대로 나와야 하기 때문이다.
 */
@Injectable()
export class CompanyStageService {
  private readonly logger = new Logger(CompanyStageService.name);

  constructor(
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessRepository: Repository<CompanyBusiness>,
    @InjectRepository(CompanyStageChange)
    private readonly changesRepository: Repository<CompanyStageChange>,
  ) {}

  /**
   * 단계를 올린다. 이미 같거나 더 높으면 아무것도 하지 않는다.
   * 자동 전환(서류분석·검증승인·메일발송)은 전부 이 메서드를 쓴다 — 자동으로 내리지는 않는다.
   */
  async advanceTo(
    companyId: string,
    businessId: string,
    target: CompanyStage,
    reason: string,
  ): Promise<CompanyBusiness | null> {
    const cb = await this.companyBusinessRepository.findOne({ where: { companyId, businessId } });
    if (!cb) {
      // 사업에 참여하지 않은 기업은 단계를 만들지 않는다. 자동으로 참여시키지 않는다.
      this.logger.debug(`단계 상향 건너뜀 — 기업 ${companyId} 는 사업 ${businessId} 에 미참여`);
      return null;
    }
    const current = cb.stage ?? CompanyStage.PROSPECT;
    if (COMPANY_STAGE_ORDER[target] <= COMPANY_STAGE_ORDER[current]) return cb;

    return this.applyChange(cb, target, 'AUTO', reason, null);
  }

  /**
   * 담당자가 직접 단계를 바꾼다. 되돌리기(역행)도 허용한다 —
   * 사업이 바뀌거나 잘못 올라간 경우 내릴 수 있어야 한다. 대신 사유와 사람을 기록한다.
   */
  async setManually(
    companyBusinessId: string,
    target: CompanyStage,
    reason: string | null,
    user: SessionUser | null,
  ): Promise<CompanyBusiness> {
    const cb = await this.companyBusinessRepository.findOne({ where: { id: companyBusinessId } });
    if (!cb) throw new NotFoundException('기업의 사업참여 기록을 찾을 수 없습니다.');
    const current = cb.stage ?? CompanyStage.PROSPECT;
    if (current === target) return cb;
    return this.applyChange(cb, target, 'MANUAL', reason, user);
  }

  private async applyChange(
    cb: CompanyBusiness,
    target: CompanyStage,
    source: 'AUTO' | 'MANUAL',
    reason: string | null,
    user: SessionUser | null,
  ): Promise<CompanyBusiness> {
    const from = cb.stage ?? CompanyStage.PROSPECT;
    cb.stage = target;
    this.syncLedgerFlags(cb, target);
    const saved = await this.companyBusinessRepository.save(cb);

    await this.changesRepository.save(
      this.changesRepository.create({
        businessId: cb.businessId,
        companyId: cb.companyId,
        companyBusinessId: cb.id,
        fromStage: from,
        toStage: target,
        source,
        reason,
        changedByUserId: user?.id ?? null,
        changedByName: user?.name ?? null,
      }),
    );

    this.logger.log(
      `단계 변경 [${source}] ${COMPANY_STAGE_LABEL[from]} -> ${COMPANY_STAGE_LABEL[target]}` +
        ` (기업 ${cb.companyId}, 사업 ${cb.businessId})${reason ? ' — ' + reason : ''}`,
    );
    return saved;
  }

  /**
   * 관리대장(공문 양식)용 불리언을 단계에 맞춘다.
   * 단계가 올라가면 켜고, 되돌리면 그 단계보다 뒤의 항목은 끈다 —
   * 단계는 내렸는데 '협약체결 Y' 가 남아 대장이 어긋나는 일을 막는다.
   */
  syncLedgerFlags(cb: CompanyBusiness, stage: CompanyStage): void {
    const at = (s: CompanyStage) => COMPANY_STAGE_ORDER[stage] >= COMPANY_STAGE_ORDER[s];
    // 주의: documentGuideSent 는 '참여자 서류 안내'다 (기업 서류가 아니다).
    // 협약을 체결한 뒤에 참여자 서류를 안내하므로 AGREEMENT_SIGNED 부터 켠다.
    cb.documentGuideSent = at(CompanyStage.AGREEMENT_SIGNED);
    cb.agreementConcluded = at(CompanyStage.AGREEMENT_SIGNED);
    cb.businessPlanRegistered = at(CompanyStage.AGREEMENT_SIGNED);
    cb.participantApplied = at(CompanyStage.WORKER_APPLIED);
    if (at(CompanyStage.AGREEMENT_SENT) && !cb.agreementSentDate) {
      cb.agreementSentDate = new Date().toISOString().slice(0, 10);
    }
    if (at(CompanyStage.AGREEMENT_SIGNED) && !cb.agreementDate) {
      cb.agreementDate = new Date().toISOString().slice(0, 10);
    }
  }

  /** 단계 변경 이력 조회 (최신순). */
  async history(companyBusinessId: string): Promise<CompanyStageChange[]> {
    return this.changesRepository.find({
      where: { companyBusinessId },
      order: { changedAt: 'DESC' },
    });
  }
}
