import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Company } from './company.entity';
import { Business } from '../businesses/business.entity';

/** 기업 × 사업(bizId) 진행상태. 협약·인원·상태는 기업 자체가 아니라 이 조합에 귀속된다. */
@Entity('company_businesses')
@Index(['companyId', 'businessId'], { unique: true })
export class CompanyBusiness {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Company, (company) => company.companyBusinesses, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'company_id' })
  companyId!: string;

  @ManyToOne(() => Business, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ name: 'business_id' })
  businessId!: string;

  /** 예: 일반형, 세대통합형 (엑셀 '참여유형' 열) */
  @Column({ name: 'participation_type', type: 'varchar', nullable: true })
  participationType?: string | null;

  @Column({ name: 'planned_headcount', type: 'int', nullable: true })
  plannedHeadcount?: number | null;

  @Column({ name: 'general_type_headcount', type: 'int', nullable: true })
  generalTypeHeadcount?: number | null;

  @Column({ name: 'intergenerational_type_headcount', type: 'int', nullable: true })
  intergenerationalTypeHeadcount?: number | null;

  @Column({ name: 'agreement_sent_date', type: 'varchar', nullable: true })
  agreementSentDate?: string | null;

  @Column({ name: 'agreement_date', type: 'varchar', nullable: true })
  agreementDate?: string | null;

  @Column({ name: 'agreement_concluded', type: 'boolean', default: false })
  agreementConcluded!: boolean;

  @Column({ name: 'business_plan_registered', type: 'boolean', default: false })
  businessPlanRegistered!: boolean;

  @Column({ name: 'document_guide_sent', type: 'boolean', default: false })
  documentGuideSent!: boolean;

  @Column({ name: 'participant_applied', type: 'boolean', default: false })
  participantApplied!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
