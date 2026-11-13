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

  it('공백만이면 null', () => {
    expect(sanitizeApprovalReason('   ')).toBeNull();
    expect(sanitizeApprovalReason(null)).toBeNull();
  });
});
