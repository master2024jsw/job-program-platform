import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CompanyStatus } from '@job-program/shared';
import { Worker } from '../workers/worker.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'business_registration_number', unique: true })
  businessRegistrationNumber!: string;

  @Column({ name: 'representative_name', type: 'varchar', nullable: true })
  representativeName?: string | null;

  @Column({ name: 'industry_type', type: 'varchar', nullable: true })
  industryType?: string | null;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ name: 'contact_manager_name', type: 'varchar', nullable: true })
  contactManagerName?: string | null;

  @Column({ name: 'contact_manager_phone', type: 'varchar', nullable: true })
  contactManagerPhone?: string | null;

  @Column({ name: 'contact_manager_email', type: 'varchar', nullable: true })
  contactManagerEmail?: string | null;

  @Column({ type: 'varchar', default: CompanyStatus.ACTIVE })
  status!: CompanyStatus;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @OneToMany(() => Worker, (worker) => worker.company)
  workers?: Worker[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
