import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JudgmentHistory } from './judgment-history.entity';
import type {
  JudgmentHistoryEntry,
  JudgmentHistoryRepository,
} from '../../common/judgment-history.repository.interface';

@Injectable()
export class JudgmentHistoryService implements JudgmentHistoryRepository {
  constructor(
    @InjectRepository(JudgmentHistory)
    private readonly repository: Repository<JudgmentHistory>,
  ) {}

  async record(entry: Omit<JudgmentHistoryEntry, 'id' | 'judgedAt'>): Promise<JudgmentHistoryEntry> {
    const saved = await this.repository.save(this.repository.create(entry));
    return saved;
  }

  findByTarget(targetType: string, targetId: string): Promise<JudgmentHistory[]> {
    return this.repository.find({ where: { targetType, targetId }, order: { judgedAt: 'DESC' } });
  }
}
