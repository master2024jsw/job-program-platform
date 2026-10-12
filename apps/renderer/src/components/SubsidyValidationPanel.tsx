import { useCallback, useEffect, useState } from 'react';
import {
  SUBSIDY_VALIDATION_STATUS_LABEL,
  type RuleResult,
  type RuleVerdict,
  type SubsidyValidationResult,
  type WorkerSubsidyAmount,
} from '@job-program/shared';
import { validationApi } from '../api/validation';

function statusBadgeClass(status: string): string {
  if (status === 'COMPLETE') return 'badge-active';
  if (status === 'RISK') return 'badge-failed';
  return 'badge-inactive';
}

function verdictBadgeClass(verdict: RuleVerdict): string {
  if (verdict === 'PASS') return 'badge-active';
  if (verdict === 'FAIL') return 'badge-failed';
  return 'badge-inactive';
}

const VERDICT_LABEL: Record<RuleVerdict, string> = {
  PASS: '통과',
  NEEDS_REVIEW: '확인필요',
  FAIL: '위험',
};

function RulesTable({ rules }: { rules: RuleResult[] }) {
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  if (rules.length === 0) return <p className="hint-text">검증 규칙 결과 없음.</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>규칙</th>
          <th>판정</th>
          <th>근거</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r: RuleResult) => (
          <tr key={r.ruleId}>
            <td>
              {r.ruleId} · {r.label}
            </td>
            <td>
              <span className={`badge ${verdictBadgeClass(r.verdict)}`}>{VERDICT_LABEL[r.verdict]}</span>
            </td>
            <td>
              {r.message}
              {openEvidence[r.ruleId] && r.evidence && (
                <pre
                  style={{
                    marginTop: '0.4rem',
                    fontSize: '0.75rem',
                    background: 'var(--surface, #f6f7f9)',
                    padding: '0.5rem',
                    borderRadius: 4,
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(r.evidence, null, 2)}
                </pre>
              )}
            </td>
            <td>
              {r.evidence && (
                <button
                  className="btn btn-sm"
                  onClick={() => setOpenEvidence((prev) => ({ ...prev, [r.ruleId]: !prev[r.ruleId] }))}
                >
                  {openEvidence[r.ruleId] ? '접기' : '근거 보기'}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WorkerSubsidyCard({ ws }: { ws: WorkerSubsidyAmount }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="card"
      style={{ padding: '0.75rem', marginBottom: '0.5rem', borderLeft: '3px solid var(--accent, #3b82f6)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>{ws.workerName}</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
            합계: <strong>{ws.total.toLocaleString()}원</strong>
          </span>
          <button className="btn btn-sm" onClick={() => setOpen((p) => !p)}>
            {open ? '접기' : '상세보기'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {ws.rounds.length > 0 && (
            <table className="data-table" style={{ marginBottom: '0.75rem' }}>
              <thead>
                <tr>
                  <th>회차</th>
                  <th>기간</th>
                  <th>유형</th>
                  <th>기준임금</th>
                  <th>지원금</th>
                </tr>
              </thead>
              <tbody>
                {ws.rounds.map((rnd) => (
                  <tr key={rnd.round}>
                    <td>{rnd.round}회차</td>
                    <td>{rnd.periodLabel}</td>
                    <td>
                      <span className={`badge ${rnd.subsidyType === 'HIRE' ? 'badge-active' : 'badge-info'}`}>
                        {rnd.subsidyType === 'HIRE' ? '채용장려금' : '인턴지원금'}
                      </span>
                    </td>
                    <td>{rnd.baseSalary.toLocaleString()}원</td>
                    <td>{rnd.calculatedAmount.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ws.rules.length > 0 && (
            <>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>근로자 검증 규칙</p>
              <RulesTable rules={ws.rules} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SubsidyValidationPanel({ businessId, companyId }: { businessId: string; companyId: string }) {
  const [result, setResult] = useState<SubsidyValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await validationApi.validateSubsidy(businessId, companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '검증 결과를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [businessId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      setResult(await validationApi.approveSubsidy(companyId, businessId));
      window.alert('승인 완료: 지원금 산정 이력에 반영했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '승인에 실패했습니다.');
    } finally {
      setApproving(false);
    }
  };

  if (loading) return <p className="hint-text">검증 중...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!result) return null;

  const { mapped } = result;

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <div className="toolbar-left" style={{ gap: '0.6rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>지원금 신청 검증</span>
          <span className={`badge ${statusBadgeClass(result.status)}`}>
            {SUBSIDY_VALIDATION_STATUS_LABEL[result.status]}
          </span>
        </div>
        <button className="btn btn-sm" onClick={load}>
          재검증
        </button>
      </div>

      {/* STEP1: 서류 존재 */}
      <div className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>필수서류 (STEP1)</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {result.documents.map((d) => (
            <li key={d.documentType} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className={`badge ${d.present && d.analyzed ? 'badge-active' : 'badge-failed'}`}>
                {d.present ? (d.analyzed ? '제출' : '분석대기') : '미제출'}
              </span>
              <span>{d.label}</span>
            </li>
          ))}
          {result.documents.length === 0 && <li className="hint-text">서류 체크리스트 없음</li>}
        </ul>
      </div>

      {/* STEP3: 기업 규칙 */}
      <div className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>기업 검증 규칙 (STEP3)</p>
        <RulesTable rules={result.rules} />
      </div>

      {/* 근로자별 지원금 + 규칙 */}
      {mapped.workerSubsidies.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              근로자별 지원금 ({mapped.applicantCount ?? mapped.workerSubsidies.length}명 · 합계{' '}
              {(mapped.totalAmount ?? 0).toLocaleString()}원)
            </p>
          </div>
          {mapped.workerSubsidies.map((ws) => (
            <WorkerSubsidyCard key={ws.workerId ?? ws.workerName} ws={ws} />
          ))}
        </div>
      )}

      {mapped.workerSubsidies.length === 0 && (
        <div className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
          <p className="hint-text" style={{ margin: 0 }}>
            산정된 지원금 데이터가 없습니다. 먼저 "산정 관리" 탭에서 회차 산정을 진행하세요.
          </p>
        </div>
      )}

      {/* 승인 */}
      <div className="card" style={{ padding: '0.85rem' }}>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={approving} onClick={handleApprove}>
            {approving ? '승인 중...' : '승인 → 산정 이력 확정'}
          </button>
        </div>
        <p className="hint-text" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
          승인하면 지원금 산정 이력이 확정되고 HUMAN 판정 이력이 남습니다.
        </p>
      </div>
    </div>
  );
}
