import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('job_announcements')
export class JobAnnouncement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  agency?: string | null;

  @Column({ name: 'source_url', type: 'varchar', nullable: true })
  sourceUrl?: string | null;

  @Column({ name: 'published_date', type: 'varchar', nullable: true })
  publishedDate?: string | null;

  @Column({ type: 'varchar', nullable: true })
  category?: string | null;

  @Column({ name: 'is_checked', type: 'boolean', default: false })
  isChecked!: boolean;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
