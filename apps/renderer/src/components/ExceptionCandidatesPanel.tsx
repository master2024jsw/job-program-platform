import { useCallback, useEffect, useState } from 'react';
import type { ExceptionCandidate } from '@job-program/shared';
import { validationApi } from '../api/validation';

const TARGET_LABEL: Record<string, string> = {
  COMPANY: '기업 신청',
  WORKER: '근로자 신청',
  SUBSIDY: '지원금 신청',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ko-KR');
}

/**
 * 예외 후보 — 심사③ 예외처리 축적 구조의 ③ 단계.
 *
 * "규칙에 걸렸는데 담당자가 그대로 승인한" 사례를 모아 보여 준다.
 * 자동으로 규칙을 만들지 않는다. 담당자가 보고 수집 양식(docs/10)에 적은 뒤,
 * 사람이 검토해서 규칙 원장에 올린다(ADR-07: 결정은 사람).
 */
export function ExceptionCandidatesPanel({ businessId }: { businessId: string | null }) {
  const [rows, setRows] = useState<ExceptionCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) {
      setRows(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await validationApi.exceptionCandidates(businessId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '예외 후보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!businessId) {
    return <p className="hint-text">사업을 먼저 선택하세요.</p>;
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>예외 후보</h3>
        <button className="btn btn-sm" disabled={loading} onClick={load}>
          {loading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      <p className="hint-text" style={{ marginTop: '0.5rem' }}>
        규칙에 걸렸는데 담당자가 그대로 승인한 건을 모은 것입니다. 같은 규칙이 반복해서 나온다면,
        지침과 현실이 어긋나는 지점이거나 담당자만 아는 처리 기준일 수 있습니다.
        <br />
        여기서 규칙이 자동으로 만들어지지는 않습니다. 내용을 보고{' '}
        <code>docs/10_예외사항_암묵지_수집.md</code> 양식에 옮겨 적으면, 검토 후 예외 규칙으로 등록됩니다.
      </p>

      {error && <p className="error-text">{error}</p>}

      {rows && rows.length === 0 && (
        <p className="hint-text" style={{ marginBottom: 0 }}>
          아직 후보가 없습니다. 걸린 규칙을 승인한 이력이 쌓이면 여기에 나타납니다.
        </p>
      )}

      {rows && rows.length > 0 && (
        <table className="data-table" style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>규칙</th>
              <th>대상</th>
              <th style={{ textAlign: 'right' }}>승인 횟수</th>
              <th style={{ textAlign: 'right' }}>대상 수</th>
              <th>최근 승인일</th>
              <th>승인 사유</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.targetType}:${row.ruleId}`}>
                <td>
                  {row.ruleId} · {row.label}
                </td>
                <td>{TARGET_LABEL[row.targetType] ?? row.targetType}</td>
                <td style={{ textAlign: 'right' }}>{row.count}</td>
                <td style={{ textAlign: 'right' }}>{row.targetCount}</td>
                <td>{formatDate(row.lastApprovedAt)}</td>
                <td>
                  {row.notes.length === 0 ? (
                    <span className="hint-text">(사유 없음)</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {row.notes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
