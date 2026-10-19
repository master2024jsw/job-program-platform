import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CompanyStage } from '@job-program/shared';

/**
 * 단계 변경 이력 (append-only).
 *
 * 되돌리기(역행)를 허용하기로 했으므로 더 중요하다 — 누가 왜 내렸는지 남지 않으면
 * "실수로 내린 것"과 "사유가 있어 내린 것"을 구분할 수 없다. 설계서 §17 감사 항목.
 *
 * 기록만 하고 수정·삭제하지 않는다.
 */
@Entity('company_stage_changes')
@Index(['companyBusinessId'])
@Index(['businessId'])
export class CompanyStageChange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'varchar' })
  businessId!: string;

  @Column({ name: 'company_id', type: 'varchar' })
  companyId!: string;

  @Column({ name: 'company_business_id', type: 'varchar' })
  companyBusinessId!: string;

  @Column({ name: 'from_stage', type: 'varchar', nullable: true })
  fromStage?: CompanyStage | null;

  @Column({ name: 'to_stage', type: 'varchar' })
  toStage!: CompanyStage;

  /** AUTO = 서류분석·검증승인·메일발송 등으로 자동, MANUAL = 담당자가 직접 */
  @Column({ type: 'varchar', default: 'AUTO' })
  source!: 'AUTO' | 'MANUAL';

  /** 무엇 때문에 바뀌었는지. 예: '기업 검증 승인', '메일 발송: 협약서 안내' */
  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ name: 'changed_by_user_id', type: 'varchar', nullable: true })
  changedByUserId?: string | null;

  @Column({ name: 'changed_by_name', type: 'varchar', nullable: true })
  changedByName?: string | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt!: Date;
}
