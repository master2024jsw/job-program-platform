import type { RuleResult } from '@job-program/shared';

/**
 * 승인 사유(예외 판단 근거) 입력칸 — 심사③ 예외처리 축적 구조.
 *
 * 걸린 규칙을 그대로 승인할 때만 보인다. 여기 적힌 사유가 판정 이력에 남고,
 * 나중에 「예외 후보」로 모여 예외 규칙의 출처가 된다.
 * 깨끗한 건에는 보이지 않으므로 평소 승인 동선은 그대로다.
 */
export function ApprovalReasonField({
  rules,
  value,
  onChange,
}: {
  /** 이 건의 규칙 판정 결과 (기본 규칙 + 예외 결과). */
  rules: RuleResult[];
  value: string;
  onChange: (next: string) => void;
}) {
  // 예외 규칙 결과는 그 자체가 "확인해 보라"는 안내라 사유를 요구하는 기준에 넣는다.
  const flagged = rules.filter((r) => r.verdict === 'NEEDS_REVIEW' || r.verdict === 'FAIL');
  if (flagged.length === 0) return null;

  const labels = flagged.slice(0, 3).map((r) => r.ruleId).join(', ');
  const more = flagged.length > 3 ? ` 외 ${flagged.length - 3}건` : '';

  return (
    <div className="field" style={{ marginTop: '0.75rem' }}>
      <label>
        승인 사유 <span style={{ fontWeight: 400, opacity: 0.7 }}>(예외 판단 근거 · 선택)</span>
      </label>
      <textarea
        className="text-input"
        rows={2}
        maxLength={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${labels}${more}이(가) 걸려 있습니다. 그대로 승인하는 이유를 적어 두면 예외 규칙을 만들 때 근거가 됩니다.`}
      />
      <p className="hint-text" style={{ marginTop: '0.3rem', marginBottom: 0 }}>
        이름·주민등록번호 등 개인정보는 적지 마세요. (저장 전 주민번호는 자동으로 가려집니다)
      </p>
    </div>
  );
}

/**
 * 규칙 행에 붙는 예외 표시.
 * - 기본 규칙에 예외가 걸렸으면 "예외 후보: X-01" 배지
 * - 결과 자체가 예외 규칙이면 "예외" 배지
 */
export function ExceptionBadges({ rule }: { rule: RuleResult }) {
  const style = {
    marginLeft: '0.35rem',
    fontSize: '0.7rem',
    padding: '0.1rem 0.35rem',
    borderRadius: 3,
    border: '1px solid var(--border, #d7d9de)',
    whiteSpace: 'nowrap' as const,
  };

  if (rule.exceptionOf) {
    return (
      <span style={style} title={`${rule.exceptionOf} 에 대한 예외 규칙`}>
        예외 · {rule.exceptionOf}
      </span>
    );
  }
  if (rule.appliedExceptions?.length) {
    return (
      <span style={style} title="이 규칙에 해당하는 예외 조건이 발견되었습니다">
        예외 후보: {rule.appliedExceptions.join(', ')}
      </span>
    );
  }
  return null;
}
