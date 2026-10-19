import { useEffect, useState } from 'react';
import type { Company, MailTemplate, Worker } from '@job-program/shared';
import {
  subsidyApi,
  type SubsidyEligibilityRow,
  type SubsidyPendingRow,
  type SubsidyCalculationRow,
} from '../api/subsidy';
import { mailApi, mailTemplatesApi } from '../api/mail';
import { workersApi } from '../api/workers';
import { companiesApi } from '../api/companies';
import { useAuth } from '../auth/AuthContext';
import { SubsidyValidationPanel } from '../components/SubsidyValidationPanel';
import { WorkerValidationPanel } from '../components/WorkerValidationPanel';
import { Modal } from '../components/Modal';

type SubTab = 'eligibility' | 'calculation' | 'validation';

export function SubsidyPage() {
  const [subTab, setSubTab] = useState<SubTab>('eligibility');

  return (
    <div className="page">
      <div className="sub-tab-nav">
        <button
          className={`btn btn-sm ${subTab === 'eligibility' ? 'btn-primary' : ''}`}
          onClick={() => setSubTab('eligibility')}
        >
          신청 안내
        </button>
        <button
          className={`btn btn-sm ${subTab === 'calculation' ? 'btn-primary' : ''}`}
          onClick={() => setSubTab('calculation')}
        >
          산정 관리
        </button>
        <button
          className={`btn btn-sm ${subTab === 'validation' ? 'btn-primary' : ''}`}
          onClick={() => setSubTab('validation')}
        >
          서류 검증
        </button>
      </div>

      {subTab === 'eligibility' && <EligibilityPanel />}
      {subTab === 'calculation' && <CalculationPanel />}
      {subTab === 'validation' && <ValidationPanel />}
    </div>
  );
}

function EligibilityPanel() {
  const { currentBusinessId } = useAuth();
  const [rows, setRows] = useState<SubsidyEligibilityRow[]>([]);
  // 안내 대상이 아닌 근로자. 걸러서 안 보이게 하면 "DB엔 있는데 여길 왜 없지?"에서 막힌다.
  const [pending, setPending] = useState<SubsidyPendingRow[]>([]);
  const [monthsInput, setMonthsInput] = useState('3');
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!currentBusinessId) return;
    setLoading(true);
    setError(null);
    try {
      const [settings, eligibility, pendingRows] = await Promise.all([
        subsidyApi.getSettings(currentBusinessId),
        subsidyApi.listEligibility(currentBusinessId),
        subsidyApi.listPendingEligibility(currentBusinessId),
      ]);
      setMonthsInput(String(settings.eligibilityMonths));
      setRows(eligibility);
      setPending(pendingRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    mailTemplatesApi.list().then(setTemplates).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  const handleSaveMonths = async () => {
    if (!currentBusinessId) return;
    const n = Number(monthsInput);
    if (!Number.isInteger(n) || n < 1 || n > 36) {
      window.alert('1~36 사이의 정수를 입력하세요.');
      return;
    }
    setSavingSettings(true);
    try {
      await subsidyApi.updateSettings(currentBusinessId, n);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleSelected = (workerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const selectEligible = () => {
    // 안내 메일은 기업으로 가므로 기업 이메일이 있는 사람만 고른다.
    setSelected(new Set(rows.filter((r) => r.eligible && r.companyEmail).map((r) => r.workerId)));
  };

  const handleBulkSend = async () => {
    if (!currentBusinessId) {
      window.alert('사업을 먼저 선택하세요.');
      return;
    }
    if (!templateId) {
      window.alert('메일 템플릿을 선택하세요.');
      return;
    }
    const targets = rows.filter((r) => selected.has(r.workerId));
    if (targets.length === 0) {
      window.alert('발송 대상을 선택하세요.');
      return;
    }

    // 지원금 서류는 기업이 제출하므로 기업 메일로 간다. 같은 기업이면 한 통으로 묶인다.
    const companies = [...new Set(targets.map((r) => r.companyName ?? '(소속 없음)'))];
    const confirmMsg = [
      `선택한 ${targets.length}명을 ${companies.length}개 기업으로 묶어 안내 메일을 보냅니다.`,
      '수신자는 각 기업의 담당 메일 주소입니다.',
      '',
      ...companies.map((c) => `· ${c}`),
    ].join('\n');
    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    try {
      const r = await subsidyApi.sendGuidance(
        currentBusinessId,
        templateId,
        targets.map((t) => t.workerId),
      );
      const lines: string[] = [];
      if (r.sent.length) {
        lines.push('발송 완료:');
        for (const x of r.sent) lines.push(`  ${x.companyName} (${x.to}) — ${x.workerNames.join(', ')}`);
      }
      if (r.skipped.length) {
        lines.push('');
        lines.push('보내지 못함:');
        for (const x of r.skipped) lines.push(`  ${x.companyName} — ${x.reason} (${x.workerNames.join(', ')})`);
      }
      window.alert(lines.join('\n') || '발송 대상이 없습니다.');
      setSelected(new Set());
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="hint-text">지원금 신청 가능 기준: 입사일 +</span>
          <input
            className="text-input"
            style={{ width: 60 }}
            type="number"
            min={1}
            max={36}
            value={monthsInput}
            onChange={(e) => setMonthsInput(e.target.value)}
          />
          <span className="hint-text">개월</span>
          <button className="btn btn-sm" disabled={savingSettings} onClick={handleSaveMonths}>
            {savingSettings ? '저장 중...' : '기준 저장'}
          </button>
        </div>
        <button className="btn" onClick={() => load()}>
          새로고침
        </button>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <select className="select-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">안내 메일 템플릿 선택</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={selectEligible}>
            신청가능 대상 전체 선택
          </button>
          <span className="hint-text">
            사용 가능 변수: {'{{companyName}}'} {'{{workerName}}'} {'{{workerCount}}'} {'{{workerList}}'}{' '}
            {'{{hireDate}}'} {'{{eligibleDate}}'} — 한 기업에 여러 명이면 {'{{workerList}}'} 에 명단이 줄별로 들어갑니다.
          </span>
        </div>
        <button className="btn btn-primary" disabled={sending} onClick={handleBulkSend}>
          {sending ? '발송 중...' : `선택 대상 안내 발송 (${selected.size})`}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>근로자명</th>
              <th>소속기업</th>
              <th>입사일</th>
              <th>신청가능일</th>
              <th>상태</th>
              <th>받는 곳 (기업 메일)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={7}>불러오는 중...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}>
                  안내 대상인 근로자가 없습니다.
                  {pending.length > 0 && ` 아래 「아직 안내 대상이 아닌 근로자」 ${pending.length}명을 확인하세요.`}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.workerId}>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!r.companyEmail}
                      checked={selected.has(r.workerId)}
                      onChange={() => toggleSelected(r.workerId)}
                    />
                  </td>
                  <td>{r.workerName}</td>
                  <td>{r.companyName ?? '-'}</td>
                  <td>{r.hireDate}</td>
                  <td>{r.eligibleDate}</td>
                  <td>
                    <span className={`badge ${r.eligible ? 'badge-active' : 'badge-inactive'}`}>
                      {r.eligible ? '신청가능' : `D-${r.daysUntilEligible}`}
                    </span>
                  </td>
                  <td>
                    {r.companyEmail ?? <span className="hint-text">기업 이메일 없음</span>}
                    {r.guidanceSent && <span className="badge badge-info">안내완료</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PendingList rows={pending} onChanged={load} />
    </div>
  );
}

/**
 * 아직 안내 대상이 아닌 근로자.
 *
 * 예전에는 조건에 안 맞으면 목록에서 그냥 사라졌다. 그러면 담당자는
 * "근로자 DB에는 있는데 지원금 안내에는 왜 없지?"에서 막힌다(2026-10-19 실제 질문).
 * 사라지게 두지 말고 **왜 아닌지와 무엇을 하면 되는지**를 같이 보여준다.
 */
function PendingList({ rows, onChanged }: { rows: SubsidyPendingRow[]; onChanged: () => void }) {
  const { currentBusinessId } = useAuth();
  const [target, setTarget] = useState<SubsidyPendingRow | null>(null);
  if (rows.length === 0) return null;

  const close = () => {
    setTarget(null);
    onChanged();
  };

  return (
    <div className="card" style={{ marginTop: '0.9rem' }}>
      <p style={{ margin: '0 0 0.2rem', fontWeight: 600 }}>
        아직 안내 대상이 아닌 근로자 <span className="hint-text">({rows.length}명)</span>
      </p>
      <p className="hint-text" style={{ margin: '0 0 0.6rem' }}>
        검증 승인을 받으면 위 목록으로 올라갑니다. 여기 있는 사람에게는 안내 메일이 나가지 않습니다.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>근로자명</th>
            <th>소속기업</th>
            <th>입사일</th>
            <th>왜 안내 대상이 아닌가</th>
            <th>하실 일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.workerId}>
              <td>{r.workerName}</td>
              <td>{r.companyName ?? '-'}</td>
              <td>{r.hireDate ?? <span className="hint-text">없음</span>}</td>
              <td>{r.reason}</td>
              <td className="hint-text">{r.action}</td>
              <td>
                <button
                  className="btn btn-sm"
                  disabled={!r.canValidate}
                  title={r.canValidate ? '근로자 신청 검증 열기' : '소속 기업이 없어 검증을 돌릴 수 없습니다'}
                  onClick={() => setTarget(r)}
                >
                  검증하러 가기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {target && target.companyId && currentBusinessId && (
        <Modal title={`근로자 신청 검증 — ${target.workerName}`} onClose={close}>
          <WorkerValidationPanel
            businessId={currentBusinessId}
            companyId={target.companyId}
            workerId={target.workerId}
            onApproved={close}
          />
        </Modal>
      )}
    </div>
  );
}

function CalculationPanel() {
  const { currentBusinessId } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [calculations, setCalculations] = useState<SubsidyCalculationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workerId, setWorkerId] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [workedDays, setWorkedDays] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCalculations(await subsidyApi.listCalculations({ businessId: currentBusinessId ?? undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '산정 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    workersApi.list({ businessId: currentBusinessId ?? undefined }).then(setWorkers).catch(() => undefined);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusinessId) {
      setCalcError('사업을 먼저 선택하세요.');
      return;
    }
    const days = Number(workedDays);
    if (!workerId) {
      setCalcError('근로자를 선택하세요.');
      return;
    }
    if (!periodLabel.trim()) {
      setCalcError('회차/기간명을 입력하세요.');
      return;
    }
    if (!Number.isInteger(days) || days < 0) {
      setCalcError('근로일수는 0 이상의 정수여야 합니다.');
      return;
    }
    setCalculating(true);
    setCalcError(null);
    try {
      await subsidyApi.calculate({
        businessId: currentBusinessId,
        workerId,
        periodLabel: periodLabel.trim(),
        workedDays: days,
      });
      setPeriodLabel('');
      setWorkedDays('');
      await load();
    } catch (e) {
      setCalcError(e instanceof Error ? e.message : '산정에 실패했습니다.');
    } finally {
      setCalculating(false);
    }
  };

  const handleDelete = async (row: SubsidyCalculationRow) => {
    if (!window.confirm(`'${row.workerName}' (${row.periodLabel}) 산정 내역을 삭제하시겠습니까?`)) return;
    try {
      await subsidyApi.removeCalculation(row.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <div>
      <p className="hint-text">
        근로일수 비례 계산: 산정액 = (급여 ÷ 30) × 근로일수. 직전 산정 대비 급여·근로일수가 변경되면 자동으로 표시됩니다.
      </p>

      <div className="card" style={{ padding: '1.25rem', maxWidth: 640, marginBottom: '1rem' }}>
        <form onSubmit={handleCalculate}>
          <div className="form-grid">
            <div className="field">
              <label className="required">근로자</label>
              <select className="select-input" value={workerId} onChange={(e) => setWorkerId(e.target.value)} required>
                <option value="">선택하세요</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.salary == null}>
                    {w.name}
                    {w.salary == null ? ' (급여 미등록)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="required">회차/기간명</label>
              <input
                className="text-input"
                placeholder="예: 2026년 7월"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="required">근로일수</label>
              <input
                className="text-input"
                type="number"
                min={0}
                value={workedDays}
                onChange={(e) => setWorkedDays(e.target.value)}
                required
              />
            </div>
          </div>

          {calcError && <p className="error-text">{calcError}</p>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={calculating}>
              {calculating ? '산정 중...' : '산정하기'}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>근로자명</th>
              <th>소속기업</th>
              <th>회차/기간</th>
              <th>근로일수</th>
              <th>일급</th>
              <th>산정액</th>
              <th>변경사항</th>
              <th>산정일시</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={9}>불러오는 중...</td>
              </tr>
            )}
            {!loading && calculations.length === 0 && (
              <tr className="empty-row">
                <td colSpan={9}>산정 이력이 없습니다.</td>
              </tr>
            )}
            {!loading &&
              calculations.map((c) => (
                <tr key={c.id}>
                  <td>{c.workerName}</td>
                  <td>{c.companyName ?? '-'}</td>
                  <td>{c.periodLabel}</td>
                  <td>{c.workedDays}일</td>
                  <td>{Math.round(c.dailyWage).toLocaleString()}원</td>
                  <td>{c.calculatedAmount.toLocaleString()}원</td>
                  <td>
                    {c.changeDetected ? (
                      <span className="error-text">{c.changeSummary}</span>
                    ) : (
                      <span className="hint-text">-</span>
                    )}
                  </td>
                  <td>{new Date(c.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="actions">
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidationPanel() {
  const { currentBusinessId } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    companiesApi
      .list({ businessId: currentBusinessId ?? undefined })
      .then((list) => {
        setCompanies(list);
        if (list.length > 0 && !companyId) setCompanyId(list[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  if (!currentBusinessId) return <p className="hint-text">사업을 먼저 선택하세요.</p>;

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="toolbar-left" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontWeight: 600 }}>기업 선택</label>
          <select
            className="text-input"
            style={{ minWidth: 200 }}
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {companies.length === 0 && <option value="">기업 없음</option>}
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {companyId ? (
        <SubsidyValidationPanel
          key={companyId}
          businessId={currentBusinessId}
          companyId={companyId}
        />
      ) : (
        <p className="hint-text">기업을 선택하면 검증 결과가 표시됩니다.</p>
      )}
    </div>
  );
}
