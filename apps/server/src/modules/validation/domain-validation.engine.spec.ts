import type { DocumentTypeCode } from '@job-program/shared';
import { DomainValidationEngine } from './domain-validation.engine';
import { JobClassificationService } from './job-classification.service';
import type { RuleDef, RuleLedger } from './validation-rules.service';
import type { ExtractedByDocumentType } from '../../common/domain-validation-engine.interface';

/**
 * 예외 규칙(exceptionRule) 엔진 분기 — 심사③ 예외처리 축적 구조.
 *
 * 여기 쓰는 예외 규칙은 전부 이 파일 안의 가짜 규칙이다.
 * 실제 원장(resources/validation-rules/*.json)의 exceptionRules 는 0건이며,
 * 실무 사례가 수집되기 전에는 비워 둔다(docs/10).
 */

const BRN = 'BUSINESS_LICENSE' as DocumentTypeCode;
const APP = 'COMPANY_APPLICATION' as DocumentTypeCode;
const PROOF = 'CORPORATE_CONVERSION_PROOF' as DocumentTypeCode;

/** 사업자번호 3자 대조를 흉내낸 기본 규칙 — 값이 다르면 NEEDS_REVIEW. */
const baseCrossCheck: RuleDef = {
  id: 'R-101',
  type: 'crossCheck',
  label: '사업자등록번호 대조',
  field: 'businessRegistrationNumber',
  documents: [BRN, APP],
  normalize: 'brn',
  onMismatch: 'NEEDS_REVIEW',
};

function ledgerOf(rules: RuleDef[], exceptionRules: RuleDef[] = []): RuleLedger {
  return {
    typeCode: 'TEST',
    target: 'COMPANY',
    guidelineYear: 2026,
    source: 'test',
    documentFields: {},
    rules,
    exceptionRules,
  };
}

describe('DomainValidationEngine — 예외 규칙', () => {
  let engine: DomainValidationEngine;

  beforeEach(() => {
    engine = new DomainValidationEngine({
      classify: () => null,
    } as unknown as JobClassificationService);
  });

  /** 사업자번호는 다르지만 대표자가 같고 상호가 비슷한 입력 (법인전환 의심 상황). */
  const mismatchedInput: ExtractedByDocumentType = {
    [BRN]: {
      businessRegistrationNumber: '111-11-11111',
      representativeName: '홍길동',
      companyName: '가나다테크',
    },
    [APP]: {
      businessRegistrationNumber: '222-22-22222',
      representativeName: '홍길동',
      companyName: '주식회사 가나다테크',
    },
  };

  it('예외 규칙이 0건이면 결과가 기존과 완전히 같다 (회귀 방지)', () => {
    const withNone = engine.validateWithLedger(ledgerOf([baseCrossCheck]), mismatchedInput);
    const direct = engine.validateWithRules([baseCrossCheck], mismatchedInput);

    expect(withNone).toHaveLength(1);
    expect(withNone).toEqual(direct);
    expect(withNone[0].appliedExceptions).toBeUndefined();
  });

  it('기본 규칙이 PASS 면 예외를 따지지 않는다', () => {
    const matched: ExtractedByDocumentType = {
      [BRN]: { businessRegistrationNumber: '111-11-11111', representativeName: '홍길동' },
      [APP]: { businessRegistrationNumber: '111-11-11111', representativeName: '홍길동' },
    };
    const exception: RuleDef = {
      id: 'X-01',
      type: 'exceptionRule',
      label: '법인전환 예외',
      appliesWhen: { failedRule: 'R-101' },
      conditions: [{ field: 'representativeName', match: 'equal', documents: [BRN, APP] }],
    };

    const results = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), matched);

    expect(results[0].verdict).toBe('PASS');
    expect(results).toHaveLength(1);
  });

  it('기본 규칙이 걸리고 조건을 만족하면 예외 결과가 1건 추가된다 (기본 판정은 그대로)', () => {
    const exception: RuleDef = {
      id: 'X-01',
      type: 'exceptionRule',
      label: '법인전환 시 사업자번호 불일치 예외',
      appliesWhen: { failedRule: 'R-101' },
      conditions: [
        { field: 'representativeName', match: 'equal', documents: [BRN, APP] },
        { field: 'companyName', match: 'similar', documents: [BRN, APP] },
      ],
      guidance: '법인전환으로 보입니다. 법인전환 증빙을 받아 확인하세요.',
    };

    const results = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), mismatchedInput);

    expect(results).toHaveLength(2);

    const base = results[0];
    expect(base.ruleId).toBe('R-101');
    // 핵심: 예외가 걸려도 기본 판정은 바뀌지 않는다 (자동 통과 금지 — ADR-07)
    expect(base.verdict).toBe('NEEDS_REVIEW');
    expect(base.appliedExceptions).toEqual(['X-01']);

    const added = results[1];
    expect(added.ruleId).toBe('X-01');
    expect(added.type).toBe('exceptionRule');
    expect(added.exceptionOf).toBe('R-101');
    expect(added.verdict).toBe('NEEDS_REVIEW');
    expect(added.message).toContain('법인전환');
    expect(added.evidence).toMatchObject({ exceptionOf: 'R-101', baseVerdict: 'NEEDS_REVIEW' });
  });

  it('조건을 만족하지 않으면 아무 결과도 추가하지 않는다', () => {
    const exception: RuleDef = {
      id: 'X-01',
      type: 'exceptionRule',
      label: '법인전환 예외',
      appliesWhen: { failedRule: 'R-101' },
      // 대표자가 다르면 법인전환으로 보지 않는다
      conditions: [{ field: 'representativeName', match: 'equal', documents: [BRN, APP] }],
    };

    const differentRep: ExtractedByDocumentType = {
      [BRN]: { businessRegistrationNumber: '111-11-11111', representativeName: '홍길동' },
      [APP]: { businessRegistrationNumber: '222-22-22222', representativeName: '김철수' },
    };

    const results = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), differentRep);

    expect(results).toHaveLength(1);
    expect(results[0].appliedExceptions).toBeUndefined();
  });

  it("onMatch: 'PASS' 라도 근거서류가 없으면 NEEDS_REVIEW 로 낮춘다", () => {
    const exception: RuleDef = {
      id: 'X-01',
      type: 'exceptionRule',
      label: '법인전환 예외',
      appliesWhen: { failedRule: 'R-101' },
      conditions: [{ field: 'representativeName', match: 'equal', documents: [BRN, APP] }],
      requiresDocument: PROOF,
      onMatch: 'PASS',
    };

    const without = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), mismatchedInput);
    expect(without[1].verdict).toBe('NEEDS_REVIEW');
    expect(without[1].message).toContain(PROOF);

    // 근거서류가 들어오면 그때는 PASS 를 허용한다
    const withProof = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), {
      ...mismatchedInput,
      [PROOF]: { issuedAt: '2026-03-01' },
    });
    expect(withProof[1].verdict).toBe('PASS');
  });

  it('exists / notExists 조건을 평가한다', () => {
    const exception: RuleDef = {
      id: 'X-02',
      type: 'exceptionRule',
      label: '증빙 미제출 예외',
      appliesWhen: { failedRule: 'R-101' },
      conditions: [{ document: PROOF, field: 'issuedAt', match: 'notExists' }],
    };

    const hit = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), mismatchedInput);
    expect(hit).toHaveLength(2);

    const miss = engine.validateWithLedger(ledgerOf([baseCrossCheck], [exception]), {
      ...mismatchedInput,
      [PROOF]: { issuedAt: '2026-03-01' },
    });
    expect(miss).toHaveLength(1);
  });

  it('appliesWhen.verdicts 로 적용 판정을 좁힐 수 있다', () => {
    const onlyFail: RuleDef = {
      id: 'X-03',
      type: 'exceptionRule',
      label: 'FAIL 일 때만',
      appliesWhen: { failedRule: 'R-101', verdicts: ['FAIL'] },
      conditions: [{ field: 'representativeName', match: 'equal', documents: [BRN, APP] }],
    };

    // 기본 규칙은 NEEDS_REVIEW 이므로 적용되지 않는다
    const results = engine.validateWithLedger(ledgerOf([baseCrossCheck], [onlyFail]), mismatchedInput);
    expect(results).toHaveLength(1);
  });

  it('예외 규칙이 기본 규칙 목록에 잘못 들어가면 조용히 통과시키지 않는다', () => {
    const misplaced: RuleDef = {
      id: 'X-04',
      type: 'exceptionRule',
      label: '잘못 등록된 예외',
      appliesWhen: { failedRule: 'R-101' },
    };

    const results = engine.validateWithRules([misplaced], {});
    expect(results[0].verdict).toBe('NEEDS_REVIEW');
    expect(results[0].message).toContain('exceptionRules');
  });
});
