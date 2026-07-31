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

  /** 사업유형코드(SENIOR/YOUTH 등). '이 사업으로 등록' 시 Business.typeCode로 프리필된다. */
  @Column({ name: 'type_code', type: 'varchar', nullable: true })
  typeCode?: string | null;

  @Column({ type: 'text', nullable: true })
  qualification?: string | null;

  @Column({ name: 'application_start_date', type: 'varchar', nullable: true })
  applicationStartDate?: string | null;

  @Column({ type: 'varchar', nullable: true })
  deadline?: string | null;

  @Column({ type: 'varchar', nullable: true })
  department?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact?: string | null;

  @Column({ type: 'varchar', default: 'manual' })
  source!: 'manual' | 'crawl';

  @Column({ name: 'is_checked', type: 'boolean', default: false })
  isChecked!: boolean;

  @Column({ name: 'is_bookmarked', type: 'boolean', default: false })
  isBookmarked!: boolean;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
