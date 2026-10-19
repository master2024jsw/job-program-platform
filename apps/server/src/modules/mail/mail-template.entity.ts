import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CompanyStage } from '@job-program/shared';

@Entity('mail_templates')
export class MailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  /**
   * 이 템플릿으로 메일을 보내면 기업 단계를 여기까지 올린다. 비워두면 단계를 바꾸지 않는다.
   * 독촉 메일처럼 "보냈다고 진행된 건 아닌" 경우를 위해 선택 사항으로 둔다.
   * 단계는 올리기만 한다 — 메일이 단계를 내리지는 않는다.
   */
  @Column({ name: 'advance_to_stage', type: 'varchar', nullable: true })
  advanceToStage?: CompanyStage | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
