import type { NextAction, NextActionSeverity } from '@job-program/shared';

/**
 * 「다음 할일」 표시.
 *
 * 판정만 보여주면 담당자가 "그래서 내가 뭘 해야 근로자 DB에 들어오나"를 스스로 추론해야 한다.
 * 그 지점에서 실제로 막혔기 때문에(2026-10-19 사용자 보고), 서버가 도출한 행동 문장을 맨 위에 띄운다.
 */
const SEVERITY_STYLE: Record<NextActionSeverity, { label: string; badge: string; border: string }> = {
  BLOCKER: { label: '막힘', badge: 'badge-failed', border: '#dc2626' },
  REVIEW: { label: '확인', badge: 'badge-inactive', border: '#d97706' },
  READY: { label: '승인대기', badge: 'badge-active', border: '#16a34a' },
};

export function NextActionList({ actions }: { actions: NextAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
        다음에 하실 일 <span className="hint-text">({actions.length}건)</span>
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {actions.map((a) => {
          const style = SEVERITY_STYLE[a.severity];
          return (
            <li
              key={a.code}
              style={{
                borderLeft: `3px solid ${style.border}`,
                padding: '0.4rem 0 0.4rem 0.6rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span className={`badge ${style.badge}`}>{style.label}</span>
                <span style={{ fontWeight: 600 }}>{a.subject}</span>
                {a.ruleId && <span className="hint-text">{a.ruleId}</span>}
              </div>
              {a.detail && (
                <p className="hint-text" style={{ margin: '0.2rem 0 0' }}>
                  {a.detail}
                </p>
              )}
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.86rem' }}>
                <strong>어디서:</strong> {a.where}
              </p>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.86rem' }}>
                <strong>그러면:</strong> {a.then}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
