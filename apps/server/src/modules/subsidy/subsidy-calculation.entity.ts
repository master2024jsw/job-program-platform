import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('subsidy_calculations')
export class SubsidyCalculation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
