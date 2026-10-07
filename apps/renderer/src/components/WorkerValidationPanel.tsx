import { useCallback, useEffect, useState } from 'react';
import {
  WORKER_VALIDATION_STATUS_LABEL,
  type WorkerLedgerFields,
  type WorkerValidationResult,
  type RuleResult,
  type RuleVerdict,
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

type EditableFields = Pick<
  WorkerLedgerFields,
  'name' | 'phone' | 'residentNumberMasked' | 'birthDate' | 'gender' | 'internStartDate' | 'internEndDate'
>;

/**
 * 근로자 신청(5단계) 대조·승인 패널.
 * businessId·companyId·workerId를 받아 CompanyValidationPanel과 동일한 구조로 동작한다.
 */
export function WorkerValidationPanel({
  businessId,
  companyId,
  workerId,
}: {
  businessId: string;
  companyId: string;
  workerId: string;
}) {
  const [result, setResult] = useState<WorkerValidationResult | null>(null);
  const [form, setForm] = useState<EditableFields | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});

  const applyResult = useCallback((data: WorkerValidationResult) => {
    setResult(data);
    setForm({
      name: data.mapped.name ?? '',
      phone: data.mapped.phone ?? '',
      residentNumberMasked: data.mapped.residentNumberMasked ?? '',
      birthDate: data.mapped.birthDate ?? '',
      gender: data.mapped.gender ?? '',
      internStartDate: data.mapped.internStartDate ?? '',
      internEndDate: data.mapped.internEndDate ?? '',
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyResult(await validationApi.validateWorker(businessId, companyId, workerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '검증 결과를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [businessId, companyId, workerId, applyResult]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    if (!form) return;
    setApproving(true);
    setError(null);
    try {
      applyResult(await validationApi.approveWorker(workerId, businessId, companyId, form));
      window.alert('승인 완료: 근로자 대장(참여자관리)에 반영했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '승인에 실패했습니다.');
    } finally {
      setApproving(false);
    }
  };

  if (loading) return <p className="hint-text">검증 중...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!result || !form) return null;

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <div className="toolbar-left" style={{ gap: '0.6rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>근로자 적격 판정</span>
          <span className={`badge ${statusBadgeClass(result.status)}`}>
            {WORKER_VALIDATION_STATUS_LABEL[result.status]}
          </span>
        </div>
        <button className="btn btn-sm" onClick={load}>
          재검증
        </button>
      </div>

      {/* STEP1: 서류 존재 확인 */}
      <div className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>제출 서류 (STEP1)</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {result.documents.map((d) => (
            <li key={d.documentType} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span
                className={`badge ${
                  d.present && d.analyzed
                    ? 'badge-active'
                    : d.optional
                      ? 'badge-inactive'
                      : 'badge-failed'
                }`}
              >
                {d.present ? (d.analyzed ? '제출' : '분석대기') : d.optional ? '미제출(선택)' : '미제출'}
              </span>
              <span>{d.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* STEP3: 규칙 판정 + 근거 */}
      <div className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>검증 규칙 R-201~210 (STEP3)</p>
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
            {result.rules.map((r: RuleResult) => (
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
            {result.rules.length === 0 && (
              <tr className="empty-row">
                <td colSpan={4}>이 사업 유형의 검증 규칙이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* STEP2: 대장 매핑값 대조·수정 → 승인 */}
      <div className="card" style={{ padding: '0.85rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>참여자 대장 반영값 (STEP2 · 수정 가능)</p>
        <div className="form-grid">
          <div className="field">
            <label>성명</label>
            <input
              className="text-input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>주민번호 (표시용)</label>
            <input
              className="text-input"
              readOnly
              value={form.residentNumberMasked ?? ''}
              style={{ background: 'var(--surface, #f6f7f9)', cursor: 'default' }}
              title="주민번호 뒤 7자리는 저장하지 않습니다"
            />
          </div>
          <div className="field">
            <label>생년월일</label>
            <input
              className="text-input"
              value={form.birthDate ?? ''}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>성별</label>
            <input
              className="text-input"
              readOnly
              value={form.gender ?? ''}
              style={{ background: 'var(--surface, #f6f7f9)', cursor: 'default' }}
            />
          </div>
          <div className="field">
            <label>연락처</label>
            <input
              className="text-input"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label>인턴시작일</label>
            <input
              className="text-input"
              value={form.internStartDate ?? ''}
              onChange={(e) => setForm({ ...form, internStartDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>인턴종료일</label>
            <input
              className="text-input"
              value={form.internEndDate ?? ''}
              onChange={(e) => setForm({ ...form, internEndDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>기업명</label>
            <input
              className="text-input"
              readOnly
              value={result.mapped.companyName ?? ''}
              style={{ background: 'var(--surface, #f6f7f9)', cursor: 'default' }}
              title="기업 DB에서 자동 조인됩니다"
            />
          </div>
          <div className="field">
            <label>참여유형</label>
            <input
              className="text-input"
              readOnly
              value={result.mapped.participationType ?? ''}
              style={{ background: 'var(--surface, #f6f7f9)', cursor: 'default' }}
              title="기업 사업 진행상태에서 자동 조인됩니다"
            />
          </div>
          <div className="field">
            <label>퇴사일</label>
            <input
              className="text-input"
              readOnly
              value=""
              placeholder="직접 입력 (근로자 정보 수정)"
              style={{ background: 'var(--surface, #f6f7f9)', cursor: 'default' }}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={approving} onClick={handleApprove}>
            {approving ? '승인 중...' : '승인 → 대장 반영'}
          </button>
        </div>
        <p className="hint-text" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
          승인하면 확정값이 근로자 DB(참여자 대장)에 반영되고, 정정 이력이 남습니다.
        </p>
      </div>
    </div>
  );
}
