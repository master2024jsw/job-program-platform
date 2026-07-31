import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { Business } from '../businesses/business.entity';

/** 담당자 ↔ 사업 배정 (다대다). staff 역할은 배정된 사업만 상단바 드롭다운에서 선택 가능하다. */
@Entity('user_businesses')
@Index(['userId', 'businessId'], { unique: true })
export class UserBusiness {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Business, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ name: 'business_id' })
  businessId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
