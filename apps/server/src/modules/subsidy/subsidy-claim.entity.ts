import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../businesses/business.entity';
import { Participation } from '../participations/participation.entity';
import type { BenefitType, Verdict } from './general-type-calculator';

/**
 * 지원금 신청 1건 = 한 참여자의 한 유형(인턴/채용) 한 회차.
 * 설계서 §11 — `participationId + benefitType + 기간 + 회차` 로 중복을 제한한다.
 *
 * 설계서 §11 의 네 가지 금액을 분리해서 담는다. 하나로 합치면 "승인했으니 지급됐다"가 되어버린다:
 *   requestedAmountWon  기업이 신청한 금액
 *   calculatedAmountWon 규칙으로 계산한 금액 (이 시스템의 산정값)
 *   approvedAmountWon   사람이 승인한 금액
 *   paidAmountWon       실제 지급이 확인된 금액  <- 승인만으로 채우지 않는다 (설계서 §5.3)
 *
 * 기존 SubsidyCalculation 테이블은 지우지 않는다. 레거시로 남긴다 (설계서 §11, F05).
 */
@Entity('subsidy_claims')
@Unique('UQ_claim_participation_type_round', ['participationId', 'benefitType', 'round'])
@Index(['businessId'])
@Index(['participationId'])
export class SubsidyClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Business, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ name: 'business_id', type: 'varchar' })
  businessId!: string;

  /** 어느 참여자의 신청인가. 신청이 있는 참여기록은 지울 수 없다. */
  @ManyToOne(() => Participation, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'participation_id' })
  participation!: Participation;

  @Column({ name: 'participation_id', type: 'varchar' })
  participationId!: string;

  /** INTERN(인턴 지원금) / HIRE(채용 지원금) */
  @Column({ name: 'benefit_type', type: 'varchar' })
  benefitType!: BenefitType;

  /** 1~3회차. 자유 입력 텍스트로 회차를 식별하지 않는다 (설계서 §11). */
  @Column({ type: 'int' })
  round!: number;

  @Column({ name: 'period_start', type: 'varchar' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'varchar' })
  periodEnd!: string;

  // --- 금액 네 가지 (원 단위 정수. null 과 0원은 다르다) ---

  @Column({ name: 'requested_amount_won', type: 'int', nullable: true })
  requestedAmountWon?: number | null;

  @Column({ name: 'calculated_amount_won', type: 'int', nullable: true })
  calculatedAmountWon?: number | null;

  @Column({ name: 'approved_amount_won', type: 'int', nullable: true })
  approvedAmountWon?: number | null;

  /** 실제 지급이 확인된 금액. 승인과 별개의 사실이다. */
  @Column({ name: 'paid_amount_won', type: 'int', nullable: true })
  paidAmountWon?: number | null;

  // --- 산정 근거 (설계서 §10.3 — 무엇으로 계산했는지 보존) ---

  @Column({ name: 'policy_id', type: 'varchar', nullable: true })
  policyId?: string | null;

  @Column({ name: 'policy_version', type: 'varchar', nullable: true })
  policyVersion?: string | null;

  /** PASS / NEEDS_REVIEW / INSUFFICIENT_DATA / NOT_APPLICABLE */
  @Column({ type: 'varchar', nullable: true })
  verdict?: Verdict | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  /** 계산에 쓴 입력 스냅샷(JSON 문자열). 나중에 같은 결과를 재현하기 위해 남긴다. */
  @Column({ name: 'input_snapshot', type: 'text', nullable: true })
  inputSnapshot?: string | null;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
