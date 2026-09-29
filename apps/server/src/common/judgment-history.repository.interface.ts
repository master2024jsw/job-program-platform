import type { CompanyValidationStatus, RuleResult } from '@job-program/shared';

/**
 * 검증 판정 이력 저장소 (비식별).
 * AI 판정과 사람 정정을 각각 한 건씩 남긴다: 사람 정정은 source=HUMAN, corrected=true.
 */
export interface JudgmentHistoryEntry {
  id: string;
  businessId: string | null;
  targetType: string;
  targetId: string;
  status: CompanyValidationStatus;
  result: RuleResult[];
  source: 'AI' | 'HUMAN';
  corrected: boolean;
  judgedAt: Date;
}

export interface JudgmentHistoryRepository {
  record(entry: Omit<JudgmentHistoryEntry, 'id' | 'judgedAt'>): Promise<JudgmentHistoryEntry>;
  findByTarget(targetType: string, targetId: string): Promise<JudgmentHistoryEntry[]>;
}
