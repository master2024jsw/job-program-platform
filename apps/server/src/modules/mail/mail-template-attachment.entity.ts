import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 메일 템플릿에 첨부된 파일. 내용을 DB에 base64로 보관해 앱 업데이트에도 보존된다. */
@Entity('mail_template_attachments')
export class MailTemplateAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'template_id' })
  templateId!: string;

  @Column({ name: 'file_name' })
  fileName!: string;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType?: string | null;

  @Column({ name: 'file_size', type: 'int' })
  fileSize!: number;

  /** 파일 내용(base64). 목록 조회 시에는 제외하고 발송 시에만 로드한다. */
  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
