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

  /**
   * 담당자 승인 사유(예외 판단 근거) — 심사③ 예외처리 축적의 원재료.
   * 화면에서 "개인정보는 적지 마세요"로 안내하고, 저장 전 주민번호는 마스킹한다.
   * (개발환경은 synchronize:true 라 컬럼이 자동 추가된다. 운영 전환 시 마이그레이션 필요 — F09)
   */
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'judged_at' })
  judgedAt!: Date;
}
