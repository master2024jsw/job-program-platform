import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ExceptionCandidate } from '@job-program/shared';
import { JudgmentHistory } from './judgment-history.entity';
import { deriveExceptionCandidates } from './exception-candidates';
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

  /** 한 사업의 전체 판정 이력 (예외 후보 집계용). */
  findByBusiness(businessId: string): Promise<JudgmentHistory[]> {
    return this.repository.find({ where: { businessId }, order: { judgedAt: 'DESC' } });
  }

  /**
   * 예외 후보 목록 — "걸렸는데 담당자가 승인한" 규칙 집계.
   * 이력이 없으면 빈 배열(0건도 정상 응답).
   */
  async exceptionCandidates(businessId: string): Promise<ExceptionCandidate[]> {
    return deriveExceptionCandidates(await this.findByBusiness(businessId));
  }
}
