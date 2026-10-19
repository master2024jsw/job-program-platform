import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { SubsidyClaim } from './subsidy-claim.entity';
import { Participation } from '../participations/participation.entity';
import {
  calculateGeneralType,
  type CalcInput,
  type CalcResult,
  type SubsidyPolicy,
} from './general-type-calculator';

const policiesDir = path.join(process.cwd(), 'resources', 'subsidy-policies');

/**
 * 지원금 신청·산정. 계산 자체는 순수 계산기(general-type-calculator)가 하고,
 * 이 서비스는 자료를 모아 넣고 결과를 저장하는 역할만 한다 (설계서 §4.3).
 *
 * 지금은 일반형만 지원한다. 세대통합형·장기취업유지형은 정책 원장이 없으므로
 * 추측해서 계산하지 않고 명시적으로 거절한다.
 */
@Injectable()
export class SubsidyClaimsService {
  private readonly logger = new Logger(SubsidyClaimsService.name);
  private readonly policies = new Map<string, SubsidyPolicy>();

  constructor(
    @InjectRepository(SubsidyClaim)
    private readonly claimsRepository: Repository<SubsidyClaim>,
    @InjectRepository(Participation)
    private readonly participationsRepository: Repository<Participation>,
  ) {
    this.loadPolicies();
  }

  private loadPolicies(): void {
    try {
      if (!fs.existsSync(policiesDir)) {
        this.logger.warn(`정책 원장 폴더가 없습니다: ${policiesDir}`);
        return;
      }
      for (const file of fs.readdirSync(policiesDir).filter((f) => f.endsWith('.json'))) {
        const p = JSON.parse(fs.readFileSync(path.join(policiesDir, file), 'utf-8')) as SubsidyPolicy;
        this.policies.set(p.participationType, p);
      }
      this.logger.log(`지원금 정책 원장 ${this.policies.size}건 로드: ${[...this.policies.keys()].join(', ')}`);
    } catch (err) {
      // 외부 자원 실패가 서버 기동을 막지 않게 한다 (기존 방어적 패턴).
      this.logger.error(`정책 원장 로드 실패: ${(err as Error).message}`);
    }
  }

  /**
   * 참여유형 문자열을 정책 키로 맞춘다.
   *
   * 현장에서 쓰는 말이 정책 원장의 키와 다르다. 특히 **'인턴형'은 이 사업에서 일반형을 가리킨다** —
   * 운영계획서에서 '인턴'/'인턴형'으로 적힌 인원을 generalTypeCount(일반형)로 뽑고 있고
   * (gemini.service.ts 의 OPERATION_PLAN 스키마), 실제 레코드에서도 participationType='인턴형' 과
   * generalTypeHeadcount=1 이 같은 서류에서 함께 나왔다. 일반형 정책 자체가
   * '인턴지원금 40만×3 + 계속고용지원금 50만×3' 구조라 인턴은 일반형의 구성요소지 별도 유형이 아니다.
   *
   * 별칭을 모르면 산정이 통째로 실패하고, 그러면 그 근로자의 화면이 비어버린다(2026-10-19 실제 발생).
   */
  private static readonly PARTICIPATION_TYPE_ALIASES: Record<string, string> = {
    '': 'GENERAL',
    '일반형': 'GENERAL',
    '일반': 'GENERAL',
    '인턴형': 'GENERAL',
    '인턴': 'GENERAL',
    '세대통합형': 'INTERGENERATIONAL',
    '세대통합': 'INTERGENERATIONAL',
    '장기취업유지형': 'LONGTERM',
    '장기취업유지': 'LONGTERM',
  };

  private resolvePolicy(participationType?: string | null): SubsidyPolicy {
    const raw = (participationType ?? '').trim();
    const normalized =
      SubsidyClaimsService.PARTICIPATION_TYPE_ALIASES[raw] ?? raw.toUpperCase();

    const policy = this.policies.get(normalized);
    if (!policy) {
      const known = [...this.policies.keys()].join(', ') || '(없음)';
      throw new BadRequestException(
        `'${participationType ?? '(미지정)'}' 유형의 지원금 정책 원장이 없습니다. ` +
          `현재 등록된 정책: ${known}. ` +
          `세대통합형·장기취업유지형은 아직 정책 원장을 만들지 않았습니다. ` +
          `유형이 잘못 들어간 것이라면 기업 DB에서 참여유형을 고치세요.`,
      );
    }
    return policy;
  }

  private async getParticipation(businessId: string, participationId: string): Promise<Participation> {
    const p = await this.participationsRepository.findOne({ where: { id: participationId } });
    if (!p || p.businessId !== businessId) {
      throw new NotFoundException('참여기록을 찾을 수 없습니다.');
    }
    return p;
  }

  /**
   * 산정 미리보기 — 저장하지 않는다.
   * asOfDate 는 호출자가 명시한다. 설계서 §10.1 "규칙의 기준일은 무조건 오늘이 아니다".
   */
  async preview(businessId: string, participationId: string, asOfDate?: string): Promise<CalcResult> {
    const p = await this.getParticipation(businessId, participationId);
    const policy = this.resolvePolicy(p.participationType);

    const approved = await this.claimsRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.approvedAmountWon), 0)', 'sum')
      .where('c.participationId = :participationId', { participationId })
      .getRawOne<{ sum: number }>();

    const input: CalcInput = {
      monthlySalaryWon: p.salary === null || p.salary === undefined ? null : Math.round(p.salary),
      hireDate: p.hireDate ?? null,
      internEndDate: p.internEndDate ?? null,
      continuousHireDate: p.continuousHireDate ?? null,
      // 계속고용 계약기간 필드가 아직 없다. null 이면 계산기가 NEEDS_REVIEW 로 돌린다 (정책 미확정 U-02).
      continuousContractMonths: null,
      alreadyApprovedWon: Number(approved?.sum ?? 0),
      asOfDate: asOfDate ?? new Date().toISOString().slice(0, 10),
    };

    return calculateGeneralType(policy, input);
  }

  async findAll(businessId: string, participationId?: string): Promise<SubsidyClaim[]> {
    const where = participationId ? { businessId, participationId } : { businessId };
    return this.claimsRepository.find({
      where,
      order: { benefitType: 'ASC', round: 'ASC' },
    });
  }

  /**
   * 산정 결과를 신청 건으로 저장한다. PASS 인 회차만 저장한다 —
   * 자료가 없어 산정 못 한 회차를 0원 신청으로 만들지 않는다 (설계서 §10.4).
   */
  async generate(businessId: string, participationId: string, asOfDate?: string): Promise<{
    created: SubsidyClaim[];
    skipped: Array<{ benefitType: string; round: number; verdict: string; reason: string }>;
    capWarning: string | null;
  }> {
    const result = await this.preview(businessId, participationId, asOfDate);

    const created: SubsidyClaim[] = [];
    const skipped: Array<{ benefitType: string; round: number; verdict: string; reason: string }> = [];

    for (const benefit of result.benefits) {
      for (const r of benefit.rounds) {
        if (r.verdict !== 'PASS' || r.amountWon === null) {
          skipped.push({
            benefitType: benefit.benefitType,
            round: r.round,
            verdict: r.verdict,
            reason: r.reason,
          });
          continue;
        }

        const existing = await this.claimsRepository.findOne({
          where: { participationId, benefitType: benefit.benefitType, round: r.round },
        });
        if (existing) {
          skipped.push({
            benefitType: benefit.benefitType,
            round: r.round,
            verdict: 'ALREADY_EXISTS',
            reason: '이미 신청 건이 있습니다. 다시 만들지 않았습니다.',
          });
          continue;
        }

        const saved = await this.claimsRepository.save(
          this.claimsRepository.create({
            businessId,
            participationId,
            benefitType: benefit.benefitType,
            round: r.round,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            calculatedAmountWon: r.amountWon,
            // 신청금액·승인금액·지급금액은 여기서 채우지 않는다. 각각 별도의 사실이다 (설계서 §11, §5.3).
            requestedAmountWon: null,
            approvedAmountWon: null,
            paidAmountWon: null,
            policyId: result.policyId,
            policyVersion: result.policyVersion,
            verdict: r.verdict,
            reason: r.reason,
            inputSnapshot: JSON.stringify(result.input),
          }),
        );
        created.push(saved);
      }
    }

    this.logger.log(
      `지원금 신청 생성: 참여기록 ${participationId} — 생성 ${created.length} / 건너뜀 ${skipped.length}`,
    );
    return { created, skipped, capWarning: result.capWarning };
  }

  async remove(businessId: string, id: string): Promise<void> {
    const found = await this.claimsRepository.findOne({ where: { id } });
    if (!found || found.businessId !== businessId) {
      throw new NotFoundException('지원금 신청 건을 찾을 수 없습니다.');
    }
    if (found.paidAmountWon !== null && found.paidAmountWon !== undefined) {
      // 설계서 §8.2 #6 — 지급이 확인된 근거는 일반 삭제로 지우지 않는다.
      throw new ConflictException('이미 지급이 기록된 신청 건은 삭제할 수 없습니다.');
    }
    await this.claimsRepository.remove(found);
  }
}
