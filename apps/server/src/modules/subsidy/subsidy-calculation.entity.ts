import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('subsidy_calculations')
export class SubsidyCalculation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'varchar', nullable: true })
  @Index()
  businessId?: string | null;

  @Column({ name: 'worker_id' })
  workerId!: string;

  @Column({ name: 'period_label' })
  periodLabel!: string;

  @Column({ name: 'worked_days', type: 'int' })
  workedDays!: number;

  @Column({ name: 'base_salary', type: 'float' })
  baseSalary!: number;

  @Column({ name: 'daily_wage', type: 'float' })
  dailyWage!: number;

  @Column({ name: 'calculated_amount', type: 'float' })
  calculatedAmount!: number;

  @Column({ name: 'change_detected', type: 'boolean', default: false })
  changeDetected!: boolean;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary?: string | null;

  /** 지원금 유형: INTERN(인턴) / HIRE(채용). 6단계에서 추가. */
  @Column({ name: 'subsidy_type', type: 'varchar', nullable: true })
  subsidyType?: 'INTERN' | 'HIRE' | null;

  /** 회차 번호 (1, 2, 3…). 6단계에서 추가. */
  @Column({ name: 'round', type: 'int', nullable: true })
  round?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
