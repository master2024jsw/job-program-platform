import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CompanyValidationStatus, RuleResult } from '@job-program/shared';

/**
 * 검증 판정 이력 (비식별 저장).
 * 한 대상(기업)에 대해 AI 판정과 사람 정정을 각각 append 한다.
 * - source=AI : analyze() 중 자동 판정
 * - source=HUMAN, corrected=true : 담당자가 대조 화면에서 수정·승인
 */
@Entity('judgment_histories')
export class JudgmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'varchar', nullable: true })
  @Index()
  businessId!: string | null;

  @Column({ name: 'target_type', type: 'varchar' })
  targetType!: string;

  @Column({ name: 'target_id', type: 'varchar' })
  @Index()
  targetId!: string;

  @Column({ type: 'varchar' })
  status!: CompanyValidationStatus;

  @Column({ type: 'simple-json' })
  result!: RuleResult[];

  @Column({ type: 'varchar' })
  source!: 'AI' | 'HUMAN';

  @Column({ type: 'boolean', default: false })
  corrected!: boolean;

  @CreateDateColumn({ name: 'judged_at' })
  judgedAt!: Date;
}
