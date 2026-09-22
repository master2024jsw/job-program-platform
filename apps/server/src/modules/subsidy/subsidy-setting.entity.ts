import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 사업별 1행. business_id는 nullable + unique 인덱스로 두는데, 기존 싱글턴(id='default') 시절 행이
 * 스키마 변경 후에도 business_id=NULL 상태로 남아있을 수 있어(SQLite는 NULL 유니크 컬럼 추가를
 * 테이블 재생성 없이 허용) service의 getSettings()가 그 값을 최초 요청 시점에 이어받는다.
 */
@Entity('subsidy_settings')
export class SubsidySetting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'varchar', nullable: true })
  @Index({ unique: true })
  businessId!: string | null;

  @Column({ name: 'eligibility_months', type: 'int', default: 3 })
  eligibilityMonths!: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
