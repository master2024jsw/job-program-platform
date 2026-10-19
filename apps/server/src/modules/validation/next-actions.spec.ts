import type { RequiredDocPresence, RuleResult } from '@job-program/shared';
import { deriveSubsidyNextActions, deriveWorkerNextActions, summarizeNextActions } from './next-actions';

/**
 * 「다음 할일」 도출 테스트.
 *
 * 여기서 지키려는 것은 한 가지다 — **걸린 게 있으면 반드시 할일이 하나는 나온다.**
 * 안내가 비어 버리면 담당자는 "왜 근로자 DB에 안 들어오지?"로 되돌아간다.
 */

const doc = (overrides: Partial<RequiredDocPresence> & { documentType: string; label: string }): RequiredDocPresence =>
  ({ present: true, analyzed: true, optional: false, ...overrides } as RequiredDocPresence);

const rule = (ruleId: string, verdict: RuleResult['verdict'], message = ''): RuleResult => ({
  ruleId,
  type: 'crossCheck',
  label: ruleId,
  verdict,
  message,
});

const ALL_DOCS: RequiredDocPresence[] = [
  doc({ documentType: 'WORKER_APPLICATION', label: '근로자 신청서' }),
  doc({ documentType: 'LABOR_CONTRACT', label: '표준근로계약서' }),
];

describe('deriveWorkerNextActions', () => {
  it('걸린 게 없으면 「승인만 하면 됩니다」 한 건만 나온다', () => {
    const actions = deriveWorkerNextActions({
      status: 'COMPLETE',
      documents: ALL_DOCS,
      rules: [rule('R-201', 'PASS')],
      worker: { name: '김영희', birthDate: '1956-01-01', hireDate: '2026-03-02' },
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].code).toBe('APPROVE');
    expect(actions[0].severity).toBe('READY');
    expect(actions[0].where).toContain('승인');
  });

  it('승인 전이라 대장이 비어 있으면 어떤 칸이 빈지 알려준다', () => {
    const actions = deriveWorkerNextActions({
      status: 'COMPLETE',
      documents: ALL_DOCS,
      rules: [],
      worker: { name: '(미확정)', birthDate: '1956-01-01', hireDate: null },
    });

    expect(actions[0].detail).toContain('성명');
    expect(actions[0].detail).toContain('입사일');
  });

  it('성명 불일치(R-201)는 근로자 DB 수정 화면을 가리킨다 — 사용자가 요청한 형태', () => {
    const actions = deriveWorkerNextActions({
      status: 'NEEDS_REVIEW',
      documents: ALL_DOCS,
      rules: [rule('R-201', 'NEEDS_REVIEW', "초본 '김영희' ≠ 신청서 '김영히'")],
      worker: { name: '김영히', birthDate: '1956-01-01', hireDate: null },
    });

    expect(actions).toHaveLength(1);
    const a = actions[0];
    expect(a.severity).toBe('REVIEW');
    expect(a.subject).toContain('성명 확인필요');
    expect(a.detail).toContain('김영히');
    expect(a.where).toBe('근로자 DB 탭 → 수정 → 성명');
    expect(a.then).toContain('근로자 DB 업데이트 예정');
    expect(a.ruleId).toBe('R-201');
  });

  it('FAIL(제외사유)은 BLOCKER 이고 "승인할 수 없다"고 말한다', () => {
    const actions = deriveWorkerNextActions({
      status: 'RISK',
      documents: ALL_DOCS,
      rules: [rule('R-204', 'FAIL', '90일 이내 동일 사업장 근무 이력 있음')],
      worker: null,
    });

    expect(actions[0].severity).toBe('BLOCKER');
    expect(actions[0].then).toContain('승인할 수 없습니다');
  });

  it('필수서류 미제출은 BLOCKER 이고 업로드를 가리킨다', () => {
    const actions = deriveWorkerNextActions({
      status: 'MISSING',
      documents: [
        doc({ documentType: 'WORKER_APPLICATION', label: '근로자 신청서' }),
        doc({ documentType: 'LABOR_CONTRACT', label: '표준근로계약서', present: false, analyzed: false }),
      ],
      rules: [],
      worker: null,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].code).toBe('DOC_MISSING:LABOR_CONTRACT');
    expect(actions[0].subject).toBe('표준근로계약서 미제출');
    expect(actions[0].where).toContain('업로드');
  });

  it('올라왔지만 항목이 안 뽑힌 서류는 「서류 유형 지정 후 분석」을 가리킨다', () => {
    const actions = deriveWorkerNextActions({
      status: 'MISSING',
      documents: [doc({ documentType: 'RESIDENT_ABSTRACT', label: '주민등록초본', analyzed: false })],
      rules: [],
      worker: null,
    });

    expect(actions[0].code).toBe('DOC_NOT_ANALYZED:RESIDENT_ABSTRACT');
    expect(actions[0].where).toContain('서류 유형 지정');
  });

  it('선택서류가 없는 것은 할일로 올리지 않는다', () => {
    const actions = deriveWorkerNextActions({
      status: 'COMPLETE',
      documents: [doc({ documentType: 'RESIDENT_ABSTRACT', label: '주민등록초본', present: false, optional: true })],
      rules: [],
      worker: { name: '김영희', birthDate: '1956-01-01', hireDate: '2026-03-02' },
    });

    expect(actions.every((a) => a.code !== 'DOC_MISSING:RESIDENT_ABSTRACT')).toBe(true);
  });

  it('막힌 것 → 확인할 것 순서로 정렬한다', () => {
    const actions = deriveWorkerNextActions({
      status: 'RISK',
      documents: ALL_DOCS,
      rules: [rule('R-201', 'NEEDS_REVIEW'), rule('R-200', 'FAIL')],
      worker: null,
    });

    expect(actions.map((a) => a.severity)).toEqual(['BLOCKER', 'REVIEW']);
  });

  it('매핑에 없는 규칙도 안내가 사라지지 않는다 (규칙이 늘어도 조용히 빠지면 안 됨)', () => {
    const actions = deriveWorkerNextActions({
      status: 'NEEDS_REVIEW',
      documents: ALL_DOCS,
      rules: [rule('R-299', 'NEEDS_REVIEW', '새로 추가된 규칙')],
      worker: null,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].ruleId).toBe('R-299');
    expect(actions[0].where).toBeTruthy();
    expect(actions[0].then).toBeTruthy();
  });

  it('걸린 규칙이 하나라도 있으면 「승인만 하면 됩니다」는 나오지 않는다', () => {
    const actions = deriveWorkerNextActions({
      status: 'NEEDS_REVIEW',
      documents: ALL_DOCS,
      rules: [rule('R-205', 'NEEDS_REVIEW')],
      worker: null,
    });

    expect(actions.some((a) => a.code === 'APPROVE')).toBe(false);
  });
});

describe('summarizeNextActions', () => {
  it('한 건이면 그대로, 여러 건이면 「외 N건」', () => {
    const actions = deriveWorkerNextActions({
      status: 'NEEDS_REVIEW',
      documents: ALL_DOCS,
      rules: [rule('R-201', 'NEEDS_REVIEW'), rule('R-205', 'NEEDS_REVIEW'), rule('R-210', 'NEEDS_REVIEW')],
      worker: null,
    });

    expect(summarizeNextActions(actions)).toBe('성명 확인필요 (초본·신청서) 외 2건');
    expect(summarizeNextActions([])).toBe('');
  });
});

describe('deriveSubsidyNextActions', () => {
  const SUBSIDY_DOCS: RequiredDocPresence[] = [
    doc({ documentType: 'SUBSIDY_APPLICATION', label: '지원금 지급신청서' }),
    doc({ documentType: 'SUBSIDY_CALCULATION', label: '지원금 산출내역' }),
  ];

  it('걸린 게 없으면 승인 한 줄만 나온다', () => {
    const actions = deriveSubsidyNextActions({ documents: SUBSIDY_DOCS, rules: [rule('R-309', 'PASS')] });
    expect(actions).toHaveLength(1);
    expect(actions[0].code).toBe('APPROVE');
    expect(actions[0].where).toContain('지원금 안내');
  });

  it('금액 불일치(R-303)는 "우리가 고치지 말고 기업에 요청"이라고 말한다', () => {
    const actions = deriveSubsidyNextActions({
      documents: SUBSIDY_DOCS,
      rules: [rule('R-303', 'NEEDS_REVIEW', '신청 420,000원 ≠ 계산 400,000원')],
    });
    expect(actions[0].subject).toContain('산정식과 다름');
    expect(actions[0].detail).toContain('420,000');
    expect(actions[0].then).toContain('기업에 수정 요청');
  });

  it('총액 불일치(R-309)는 신청서·산출내역 두 서류를 가리킨다', () => {
    const actions = deriveSubsidyNextActions({
      documents: SUBSIDY_DOCS,
      rules: [rule('R-309', 'NEEDS_REVIEW')],
    });
    expect(actions[0].where).toContain('지원금 지급신청서');
    expect(actions[0].where).toContain('지원금 산출내역');
  });

  it('계좌 관련 규칙은 모두 "지급 전에 맞춰야 한다"고 말한다', () => {
    for (const id of ['R-308', 'R-308a', 'R-308b']) {
      const actions = deriveSubsidyNextActions({ documents: SUBSIDY_DOCS, rules: [rule(id, 'NEEDS_REVIEW')] });
      expect(actions[0].then).toContain('지급 전에');
    }
  });

  it('필수서류 미제출은 BLOCKER 이고 기업에 요청하라고 한다', () => {
    const actions = deriveSubsidyNextActions({
      documents: [
        doc({ documentType: 'SUBSIDY_APPLICATION', label: '지원금 지급신청서' }),
        doc({ documentType: 'PAYROLL', label: '급여명세서', present: false, analyzed: false }),
      ],
      rules: [],
    });
    expect(actions[0].severity).toBe('BLOCKER');
    expect(actions[0].subject).toBe('급여명세서 미제출');
    expect(actions[0].where).toContain('기업에 제출 요청');
  });

  it('선택서류(통장사본)가 없는 것은 할일로 올리지 않는다', () => {
    const actions = deriveSubsidyNextActions({
      documents: [doc({ documentType: 'BANK_ACCOUNT_COPY', label: '통장사본', present: false, optional: true })],
      rules: [],
    });
    expect(actions.every((a) => a.code !== 'DOC_MISSING:BANK_ACCOUNT_COPY')).toBe(true);
  });

  it('13개 규칙 전부 동선이 매핑되어 있다 (뭉뚱그린 안내로 떨어지지 않는다)', () => {
    const ids = ['R-301', 'R-301b', 'R-302', 'R-303', 'R-304', 'R-305', 'R-306', 'R-307',
                 'R-308', 'R-308a', 'R-308b', 'R-308c', 'R-309'];
    for (const id of ids) {
      const [a] = deriveSubsidyNextActions({ documents: SUBSIDY_DOCS, rules: [rule(id, 'NEEDS_REVIEW')] });
      expect(a.subject).not.toBe('확인필요'); // GENERIC 으로 떨어졌다는 뜻
      expect(a.ruleId).toBe(id);
    }
  });

  it('매핑에 없는 규칙도 안내가 사라지지 않는다', () => {
    const [a] = deriveSubsidyNextActions({ documents: SUBSIDY_DOCS, rules: [rule('R-399', 'NEEDS_REVIEW')] });
    expect(a.ruleId).toBe('R-399');
    expect(a.where).toBeTruthy();
  });
});
