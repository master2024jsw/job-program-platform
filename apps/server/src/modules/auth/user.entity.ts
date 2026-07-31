import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from '@job-program/shared';
import { Institution } from './institution.entity';

@Entity('users')
@Index(['institutionId', 'loginId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Institution, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institution_id' })
  institution!: Institution;

  @Column({ name: 'institution_id' })
  institutionId!: string;

  @Column({ name: 'login_id' })
  loginId!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', default: UserRole.STAFF })
  role!: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
