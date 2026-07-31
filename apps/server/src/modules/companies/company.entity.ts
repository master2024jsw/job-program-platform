import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CompanyStatus } from '@job-program/shared';
import { Worker } from '../workers/worker.entity';
import { CompanyBusiness } from './company-business.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  /** 정규화 형식: 000-00-00000. 기관 범위 내 유니크(연동키) — 없으면 기업명으로 임시 매칭한다. */
  @Column({ name: 'business_registration_number', type: 'varchar', nullable: true, unique: true })
  businessRegistrationNumber?: string | null;

  @Column({ name: 'representative_name', type: 'varchar', nullable: true })
  representativeName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', nullable: true })
  fax?: string | null;

  @Column({ name: 'industry_type', type: 'varchar', nullable: true })
  industryType?: string | null;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', default: CompanyStatus.ACTIVE })
  status!: CompanyStatus;

  @Column({ type: 'varchar', default: 'manual' })
  source!: 'excel' | 'manual' | 'api';

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @OneToMany(() => Worker, (worker) => worker.company)
  workers?: Worker[];

  @OneToMany(() => CompanyBusiness, (cb) => cb.company)
  companyBusinesses?: CompanyBusiness[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
