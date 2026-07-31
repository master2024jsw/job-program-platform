import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** id(bizId) 형식: BIZ-{연도}-{유형코드}. 상단바에서 선택된 현재 사업 기준으로 전역 스코프된다. */
@Entity('businesses')
export class Business {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'institution_id' })
  institutionId!: string;

  @Column()
  name!: string;

  @Column({ name: 'type_code' })
  typeCode!: string;

  @Column({ name: 'base_year', type: 'int' })
  baseYear!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
