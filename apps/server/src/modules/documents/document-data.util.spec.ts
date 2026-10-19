import { effectiveDocumentData, isEmptyFieldSet } from './document-data.util';

/**
 * 핵심 규칙 하나: **빈 검토값은 추출값을 가리지 않는다.**
 * 이게 깨지면 "화면엔 값이 보이는데 근로자 DB엔 안 들어온다"가 다시 생긴다.
 */
describe('isEmptyFieldSet', () => {
  it('documentType·missingItems 만 있으면 비었다고 본다', () => {
    expect(isEmptyFieldSet({ documentType: 'RESIDENT_ABSTRACT', missingItems: [] })).toBe(true);
    expect(isEmptyFieldSet({ documentType: 'RESIDENT_ABSTRACT', missingItems: ['서명 없음'] })).toBe(true);
  });

  it('값이 빈 문자열·null·빈 배열뿐이면 비었다고 본다', () => {
    expect(isEmptyFieldSet({ name: '', residentNumber: null, workplaces: [] })).toBe(true);
    expect(isEmptyFieldSet({ name: '   ' })).toBe(true);
  });

  it('항목이 하나라도 있으면 비지 않았다', () => {
    expect(isEmptyFieldSet({ name: '김영희' })).toBe(false);
    expect(isEmptyFieldSet({ hasInternKeyword: false })).toBe(false); // false 도 값이다
    expect(isEmptyFieldSet({ workplaces: [{ companyName: '가나상사' }] })).toBe(false);
  });

  it('null·배열·원시값은 비었다고 본다', () => {
    expect(isEmptyFieldSet(null)).toBe(true);
    expect(isEmptyFieldSet(undefined)).toBe(true);
    expect(isEmptyFieldSet([{ name: '김영희' }])).toBe(true);
  });
});

describe('effectiveDocumentData', () => {
  it('검토값에 내용이 있으면 검토값이 이긴다 (담당자 정정 우선)', () => {
    const d = effectiveDocumentData({
      reviewedData: { name: '김영희' },
      extractedData: { name: '김영히' },
    });
    expect(d).toEqual({ name: '김영희' });
  });

  it('검토값이 비어 있으면 추출값을 쓴다 — 이번에 고친 지점', () => {
    const d = effectiveDocumentData({
      reviewedData: { documentType: 'RESIDENT_ABSTRACT', missingItems: [] },
      extractedData: { documentType: 'RESIDENT_ABSTRACT', name: '김영희', residentNumber: '560101-1111113' },
    });
    expect(d).toMatchObject({ name: '김영희', residentNumber: '560101-1111113' });
  });

  it('검토값이 아직 없으면 추출값을 쓴다', () => {
    expect(effectiveDocumentData({ reviewedData: null, extractedData: { name: '김영희' } })).toEqual({
      name: '김영희',
    });
  });

  it('둘 다 비어 있으면 빈 값을 돌려준다', () => {
    expect(effectiveDocumentData({ reviewedData: null, extractedData: null })).toBeNull();
  });

  it('담당자가 값을 지운 경우에도 추출값이 되살아나지 않게 — 한 칸이라도 남아 있으면 검토값 유지', () => {
    const d = effectiveDocumentData({
      reviewedData: { name: '김영희' }, // residentNumber 를 일부러 지움
      extractedData: { name: '김영히', residentNumber: '560101-1111113' },
    });
    expect(d).toEqual({ name: '김영희' });
    expect(d).not.toHaveProperty('residentNumber');
  });
});
