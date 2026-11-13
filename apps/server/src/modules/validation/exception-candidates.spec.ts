import type { RuleResult } from '@job-program/shared';
import { deriveExceptionCandidates, type JudgmentHistoryLike } from './exception-candidates';

/** 테스트용 규칙 결과 1건. */
function rule(ruleId: string, verdict: RuleResult['verdict'], extra: Partial<RuleResult> = {}): RuleResult {
  return {
    ruleId,
    type: 'crossCheck',
    label: `${ruleId} 라벨`,
    verdict,
    message: '',
    ...extra,
  };
}

function history(partial: Partial<JudgmentHistoryLike>): JudgmentHistoryLike {
  return {
    targetType: 'WORKER',
    targetId: 'w1',
    result: [],
    source: 'HUMAN',
    corrected: true,
    judgedAt: '2026-11-01T00:00:00.000Z',
    ...partial,
  };
}

describe('deriveExceptionCandidates', () => {
  it('이력이 없으면 빈 배열 (0건도 정상)', () => {
    expect(deriveExceptionCandidates([])).toEqual([]);
  });

  it('HUMAN 승인 시점에 걸려 있던 규칙만 센다', () => {
    const candidates = deriveExceptionCandidates([
      history({
        result: [rule('R-201', 'PASS'), rule('R-203', 'NEEDS_REVIEW'), rule('R-205', 'FAIL')],
      }),
    ]);

    expect(candidates.map((c) => c.ruleId)).toEqual(['R-203', 'R-205']);
    expect(candidates[0].count).toBe(1);
    expect(candidates[0].label).toBe('R-203 라벨');
  });

  it('AI 판정 이력은 세지 않는다 (사람이 넘긴 것만 예외 후보)', () => {
    const candidates = deriveExceptionCandidates([
      history({ source: 'AI', corrected: false, result: [rule('R-203', 'NEEDS_REVIEW')] }),
      history({ source: 'HUMAN', corrected: false, result: [rule('R-203', 'NEEDS_REVIEW')] }),
    ]);

    expect(candidates).toEqual([]);
  });

  it('예외 규칙 결과 자체는 후보가 아니다', () => {
    const candidates = deriveExceptionCandidates([
      history({ result: [rule('X-01', 'NEEDS_REVIEW', { type: 'exceptionRule', exceptionOf: 'R-101' })] }),
    ]);

    expect(candidates).toEqual([]);
  });

  it('같은 규칙이 여러 대상에서 나오면 합산하고 승인 횟수 순으로 정렬한다', () => {
    const candidates = deriveExceptionCandidates([
      history({ targetId: 'w1', result: [rule('R-203', 'NEEDS_REVIEW')] }),
      history({ targetId: 'w2', result: [rule('R-203', 'NEEDS_REVIEW')] }),
      history({ targetId: 'w2', result: [rule('R-203', 'NEEDS_REVIEW')] }),
      history({ targetId: 'w3', result: [rule('R-208', 'NEEDS_REVIEW')] }),
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ ruleId: 'R-203', count: 3, targetCount: 2 });
    expect(candidates[1]).toMatchObject({ ruleId: 'R-208', count: 1, targetCount: 1 });
  });

  it('대상 종류(WORKER/SUBSIDY)가 다르면 따로 센다', () => {
    const candidates = deriveExceptionCandidates([
      history({ targetType: 'WORKER', result: [rule('R-203', 'NEEDS_REVIEW')] }),
      history({ targetType: 'SUBSIDY', result: [rule('R-203', 'NEEDS_REVIEW')] }),
    ]);

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((c) => c.targetType))).toEqual(new Set(['WORKER', 'SUBSIDY']));
  });

  it('승인 사유는 최근 것부터 5개까지만, 빈 사유는 빼고 모은다', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      history({
        targetId: `w${i}`,
        judgedAt: `2026-11-0${i + 1}T00:00:00.000Z`,
        note: `사유${i + 1}`,
        result: [rule('R-203', 'NEEDS_REVIEW')],
      }),
    );
    rows.push(history({ targetId: 'w9', note: '   ', result: [rule('R-203', 'NEEDS_REVIEW')] }));

    const [candidate] = deriveExceptionCandidates(rows);

    expect(candidate.count).toBe(8);
    expect(candidate.notes).toEqual(['사유7', '사유6', '사유5', '사유4', '사유3']);
    expect(candidate.lastApprovedAt).toBe('2026-11-07T00:00:00.000Z');
  });

  it('Date 객체로 들어온 judgedAt 도 처리한다', () => {
    const [candidate] = deriveExceptionCandidates([
      history({ judgedAt: new Date('2026-11-05T09:30:00.000Z'), result: [rule('R-203', 'FAIL')] }),
    ]);

    expect(candidate.lastApprovedAt).toBe('2026-11-05T09:30:00.000Z');
  });
});
