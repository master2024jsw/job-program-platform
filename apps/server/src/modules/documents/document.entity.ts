import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DocumentAnalysisStatus } from '@job-program/shared';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'file_name' })
  fileName!: string;

  @Column({ name: 'file_path' })
  filePath!: string;

  @Column({ name: 'converted_file_path', type: 'varchar', nullable: true })
  convertedFilePath?: string | null;

  @Column({ name: 'mime_type' })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize!: number;

  @Column({ name: 'document_type', type: 'varchar', nullable: true })
  documentType?: string | null;

  @Column({ name: 'company_id', type: 'varchar', nullable: true })
  companyId?: string | null;

  @Column({ name: 'worker_id', type: 'varchar', nullable: true })
  workerId?: string | null;

  @Column({ type: 'varchar', default: 'UPLOAD' })
  source!: 'UPLOAD' | 'IMAP';

  @Column({ name: 'sender_email', type: 'varchar', nullable: true })
  senderEmail?: string | null;

  @Column({ type: 'varchar', default: DocumentAnalysisStatus.PENDING })
  status!: DocumentAnalysisStatus;

  @Column({ name: 'extracted_data', type: 'simple-json', nullable: true })
  extractedData?: Record<string, unknown> | null;

  @Column({ name: 'reviewed_data', type: 'simple-json', nullable: true })
  reviewedData?: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'analyzed_at', type: 'datetime', nullable: true })
  analyzedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
