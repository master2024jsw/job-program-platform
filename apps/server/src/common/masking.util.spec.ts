import { maskResidentNumbers, maskResidentNumbersFully, sanitizeApprovalReason } from './masking.util';

describe('masking.util', () => {
  // 서류 추출값: 생년월일은 만연령 계산(R-200)에 쓰이므로 앞자리를 남긴다.
  it('maskResidentNumbers 는 앞 6자리와 성별 1자리를 남긴다', () => {
    expect(maskResidentNumbers('주민등록번호 620315-1234567 확인')).toBe('주민등록번호 620315-1****** 확인');
  });

  // 자유 입력 칸: 앞자리(생년월일·성별)도 개인정보라 전부 가린다.
  it('maskResidentNumbersFully 는 앞자리까지 가린다', () => {
    expect(maskResidentNumbersFully('620315-1234567')).toBe('******-*******');
    expect(maskResidentNumbersFully('620315 1234567')).toBe('******-*******');
    expect(maskResidentNumbersFully('6203151234567')).toBe('******-*******');
  });

  it('승인 사유에는 주민번호가 남지 않는다 (앞자리 포함)', () => {
    const out = sanitizeApprovalReason('전 직장 퇴사일 확인함. 주민등록번호 900101-2345678 일치.');
    expect(out).toBe('전 직장 퇴사일 확인함. 주민등록번호 ******-******* 일치.');
    expect(out).not.toMatch(/\d{6}/);
  });

  // 이미 뒤 7자리만 마스킹된 형태로 들어와도 앞자리를 남기지 않는다.
  it('부분 마스킹된 값도 앞자리를 가린다', () => {
    expect(sanitizeApprovalReason('주민등록번호 900101-2****** 일치')).toBe('주민등록번호 ******-******* 일치');
  });

  // 외부 AI로 나가는 문서 본문 텍스트 마스킹 (2026-11-14) — 실제 서류에 나타난 세 가지 표기.
  describe('문서 본문 표기별 마스킹', () => {
    it('구분자 없는 13자리도 가린다 (4대보험 가입자명부 형태)', () => {
      expect(maskResidentNumbers('홍길동 9001012345678 지역가입')).toBe('홍길동 900101-2****** 지역가입');
    });

    it('하이픈 앞뒤에 공백이 있어도 가린다', () => {
      expect(maskResidentNumbers('900101 - 2345678')).toBe('900101-2******');
    });

    it('표 안에 여러 건이 있어도 모두 가린다', () => {
      const table = '| 홍길동 | 900101-2345678 |\n| 김철수 | 8502023456789 |';
      const out = maskResidentNumbers(table);
      expect(out).toContain('900101-2******');
      expect(out).toContain('850202-3******');
      expect(out).not.toMatch(/\d{6}-?[1-4]\d{6}/);
    });

    // 과도 마스킹 방지: 금액·날짜·사업자번호는 건드리지 않아야 추출이 망가지지 않는다.
    it('금액·사업자등록번호는 가리지 않는다', () => {
      expect(maskResidentNumbers('지원금 1,466,667원')).toBe('지원금 1,466,667원');
      expect(maskResidentNumbers('사업자등록번호 123-45-67890')).toBe('사업자등록번호 123-45-67890');
      expect(maskResidentNumbers('근로시작일 2026-06-01')).toBe('근로시작일 2026-06-01');
    });

    // 뒤 7자리 첫 자리가 5~9 이면 주민번호가 아니다 (외국인등록번호는 별도 과제).
    it('뒤 첫 자리가 5~9 인 13자리는 가리지 않는다', () => {
      expect(maskResidentNumbers('9001019345678')).toBe('9001019345678');
    });
  });

  it('공백만이면 null', () => {
    expect(sanitizeApprovalReason('   ')).toBeNull();
    expect(sanitizeApprovalReason(null)).toBeNull();
  });
});
