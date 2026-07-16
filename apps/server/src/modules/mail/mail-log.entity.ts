import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { MailLogStatus } from '@job-program/shared';

@Entity('mail_logs')
export class MailLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  to!: string;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar' })
  status!: MailLogStatus;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'template_id', type: 'varchar', nullable: true })
  templateId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
