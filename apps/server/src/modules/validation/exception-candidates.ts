import type { ExceptionCandidate, RuleResult } from '@job-program/shared';

/**
 * 예외 후보 추출 — 심사③ "예외사항·암묵지를 별도 섹션으로" 대응의 ③ 단계.
 *
 * 규칙에 걸렸는데 담당자가 그대로 승인했다면, 그 규칙은 지침과 현실이 어긋나는 지점이거나
 * 담당자 머릿속에만 있는 처리 기준(암묵지)이 작동한 지점이다.
 * 그 사례를 모아서 보여 주면, 실무자가 기억을 더듬지 않아도 "무엇을 예외로 적어야 하는지"가 드러난다.
 *
 * 자동으로 원장에 등록하지 않는다(ADR-07: 결정은 사람).
 * 사람이 보고 docs/10 수집 양식에 적은 뒤, 원장 exceptionRules 에 출처와 함께 올린다.
 *
 * DB·HTTP 를 모르는 순수 함수로 둔다(설계서 F14 — 합성 입력만으로 반복 테스트 가능).
 */

/** 집계에 필요한 최소 형태. 엔티티를 직접 받지 않아 테스트에서 합성 입력을 쓸 수 있다. */
export interface JudgmentHistoryLike {
  targetType: string;
  targetId: string;
  result: RuleResult[];
  source: 'AI' | 'HUMAN';
  corrected: boolean;
  judgedAt: Date | string;
  note?: string | null;
}

/** 최근 승인 사유를 몇 개까지 보여줄지. */
const MAX_NOTES = 5;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * HUMAN 승인 이력에서 "걸린 채로 승인된 기본 규칙"을 센다.
 *
 * 세는 대상:
 *   - source === 'HUMAN' && corrected === true  (담당자가 보고 승인한 시점의 판정)
 *   - 그 시점 결과 중 verdict 가 NEEDS_REVIEW 또는 FAIL 인 규칙
 *   - exceptionOf 가 없는 것만 (예외 규칙 결과 자체는 후보가 아니다 — 이미 규칙이 있다)
 *
 * targetType + ruleId 로 묶고, 승인 횟수 많은 순으로 정렬한다.
 */
export function deriveExceptionCandidates(histories: JudgmentHistoryLike[]): ExceptionCandidate[] {
  const bucket = new Map<
    string,
    {
      targetType: string;
      ruleId: string;
      label: string;
      count: number;
      targets: Set<string>;
      lastApprovedAt: string;
      /** [승인시각, 사유] — 최근 것부터 MAX_NOTES 개만 쓴다. */
      notes: { at: string; text: string }[];
    }
  >();

  for (const history of histories) {
    if (history.source !== 'HUMAN' || !history.corrected) continue;
    const at = toIso(history.judgedAt);

    for (const rule of history.result ?? []) {
      if (rule.exceptionOf) continue;
      if (rule.verdict !== 'NEEDS_REVIEW' && rule.verdict !== 'FAIL') continue;

      const key = `${history.targetType}:${rule.ruleId}`;
      const entry = bucket.get(key) ?? {
        targetType: history.targetType,
        ruleId: rule.ruleId,
        label: rule.label,
        count: 0,
        targets: new Set<string>(),
        lastApprovedAt: at,
        notes: [],
      };

      entry.count += 1;
      entry.targets.add(history.targetId);
      if (at > entry.lastApprovedAt) entry.lastApprovedAt = at;
      // 같은 승인 1건이 같은 규칙을 두 번 담을 일은 없으므로 사유는 규칙마다 한 번만 붙인다.
      const text = (history.note ?? '').trim();
      if (text) entry.notes.push({ at, text });

      bucket.set(key, entry);
    }
  }

  return [...bucket.values()]
    .map((e) => ({
      targetType: e.targetType,
      ruleId: e.ruleId,
      label: e.label,
      count: e.count,
      targetCount: e.targets.size,
      lastApprovedAt: e.lastApprovedAt,
      notes: e.notes
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, MAX_NOTES)
        .map((n) => n.text),
    }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));
}
