import type { DomainValidationResult } from './domain-validation-engine.interface';

/**
 * DomainValidationEngine의 판정 결과 이력을 저장하는 자리.
 * 이번 배치에서는 타입만 선언하고 구현·호출하지 않는다 (4·5·6단계 지시서에서 구현 예정).
 */
export interface JudgmentHistoryEntry {
  id: string;
  targetType: string;
  targetId: string;
  result: DomainValidationResult[];
  judgedAt: Date;
}

export interface JudgmentHistoryRepository {
  save(entry: Omit<JudgmentHistoryEntry, 'id' | 'judgedAt'>): Promise<JudgmentHistoryEntry>;
  findByTarget(targetType: string, targetId: string): Promise<JudgmentHistoryEntry[]>;
}
