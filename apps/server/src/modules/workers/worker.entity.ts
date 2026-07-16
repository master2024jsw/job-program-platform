import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ContractType, Gender, WorkerStatus } from '@job-program/shared';
import { Company } from '../companies/company.entity';

@Entity('workers')
export class Worker {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'birth_date' })
  birthDate!: string;

  @Column({ type: 'varchar', nullable: true })
  gender?: Gender | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @ManyToOne(() => Company, (company) => company.workers, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company?: Company | null;

  @Column({ name: 'company_id', type: 'varchar', nullable: true })
  companyId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  position?: string | null;

  @Column({ name: 'contract_type', type: 'varchar', nullable: true })
  contractType?: ContractType | null;

  @Column({ name: 'hire_date', type: 'varchar', nullable: true })
  hireDate?: string | null;

  @Column({ name: 'resign_date', type: 'varchar', nullable: true })
  resignDate?: string | null;

  @Column({ type: 'float', nullable: true })
  salary?: number | null;

  @Column({ type: 'varchar', default: WorkerStatus.ACTIVE })
  status!: WorkerStatus;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
