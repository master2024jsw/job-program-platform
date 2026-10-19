import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationStatus, ContractType, WorkerStatus } from '@job-program/shared';
import { Business } from '../businesses/business.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Worker } from '../workers/worker.entity';

/**
 * 근로자의 사업참여 기록 — 설계서 01_Architecture_v2 §2·§7, ADR-04.
 *
 * 왜 Worker 에 직접 담지 않는가:
 * Worker 는 '사람 원장'이다. 같은 사람이 다른 연도·다른 사업에 참여할 수 있으므로
 * 급여·계약·참여기간처럼 사업마다 달라지는 값을 Worker 에 두면 서로 덮어쓴다.
 * 이 테이블이 `기업의 사업참여(CompanyBusiness) -> 근로자의 사업참여 -> 지원금 신청`
 * 계단의 가운데 칸이다.
 *
 * 기존 Worker 의 같은 이름 컬럼은 호환을 위해 당장 지우지 않는다(설계서 §7 '정리' 단계).
 * 다만 v2 의 쓰기는 이 테이블을 기준으로 한다.
 */
@Entity('participations')
@Index(['businessId', 'workerId'])
@Index(['companyBusinessId'])
export class Participation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Business.id 는 UUID 가 아니라 'BIZ-2026-SENIOR' 형식 문자열이다 (CLAUDE.md 참고).
  @ManyToOne(() => Business, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ name: 'business_id', type: 'varchar' })
  businessId!: string;

  /** 어느 기업의 어느 사업 참여 아래인가. 삭제 시 RESTRICT — 근로자참여가 조용히 사라지지 않게 한다. */
  @ManyToOne(() => CompanyBusiness, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_business_id' })
  companyBusiness!: CompanyBusiness;

  @Column({ name: 'company_business_id', type: 'varchar' })
  companyBusinessId!: string;

  /** 사람 원장. 참여기록이 있는 사람을 지울 수 없게 RESTRICT. */
  @ManyToOne(() => Worker, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'worker_id' })
  worker!: Worker;

  @Column({ name: 'worker_id', type: 'varchar' })
  workerId!: string;

  /** 일반형 / 세대통합형 등. CompanyBusiness.participationType 과 같은 방식으로 문자열로 둔다. */
  @Column({ name: 'participation_type', type: 'varchar', nullable: true })
  participationType?: string | null;

  @Column({ type: 'varchar', nullable: true })
  position?: string | null;

  @Column({ name: 'contract_type', type: 'varchar', nullable: true })
  contractType?: ContractType | null;

  /** 참여개시일(= 입사일). 설계서는 '참여기간'이라 부른다. */
  @Column({ name: 'hire_date', type: 'varchar', nullable: true })
  hireDate?: string | null;

  /** 인턴십 종료 예정일 (인턴기간 = 입사일~인턴종료일) */
  @Column({ name: 'intern_end_date', type: 'varchar', nullable: true })
  internEndDate?: string | null;

  /** 참여종료일(= 퇴사일) */
  @Column({ name: 'resign_date', type: 'varchar', nullable: true })
  resignDate?: string | null;

  /** 인턴 종료 후 계속고용 전환일 */
  @Column({ name: 'continuous_hire_date', type: 'varchar', nullable: true })
  continuousHireDate?: string | null;

  @Column({ type: 'float', nullable: true })
  salary?: number | null;

  @Column({ type: 'varchar', default: WorkerStatus.ACTIVE })
  status!: WorkerStatus;

  @Column({ name: 'application_status', type: 'varchar', nullable: true })
  applicationStatus?: ApplicationStatus | null;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  /**
   * 기존 workers 행에서 옮겨온 기록인지 표시. 설계서 §18 '레거시 기록으로 연결' 원칙 —
   * 사후에 공식 검증·승인 이력으로 바꾸지 않기 위해 출처를 남긴다.
   */
  @Column({ name: 'migrated_from_worker', type: 'boolean', default: false })
  migratedFromWorker!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
