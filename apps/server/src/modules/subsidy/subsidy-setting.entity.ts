import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('subsidy_settings')
export class SubsidySetting {
  @PrimaryColumn({ default: 'default' })
  id!: string;

  @Column({ name: 'eligibility_months', type: 'int', default: 3 })
  eligibilityMonths!: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
