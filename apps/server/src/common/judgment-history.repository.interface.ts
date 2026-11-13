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
  /** 담당자 승인 사유 (예외 판단 근거). 저장 전 주민번호 마스킹. */
  note?: string | null;
}

export interface JudgmentHistoryRepository {
  record(entry: Omit<JudgmentHistoryEntry, 'id' | 'judgedAt'>): Promise<JudgmentHistoryEntry>;
  findByTarget(targetType: string, targetId: string): Promise<JudgmentHistoryEntry[]>;
  /** 예외 후보 집계용 — 한 사업의 전체 이력. */
  findByBusiness(businessId: string): Promise<JudgmentHistoryEntry[]>;
}
