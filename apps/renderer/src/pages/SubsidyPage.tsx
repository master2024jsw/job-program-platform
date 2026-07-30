import { useEffect, useState } from 'react';
import type { MailTemplate, Worker } from '@job-program/shared';
import { subsidyApi, type SubsidyEligibilityRow, type SubsidyCalculationRow } from '../api/subsidy';
import { mailApi, mailTemplatesApi } from '../api/mail';
import { workersApi } from '../api/workers';

type SubTab = 'eligibility' | 'calculation';

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
      </div>

      {subTab === 'eligibility' && <EligibilityPanel />}
      {subTab === 'calculation' && <CalculationPanel />}
    </div>
  );
}

function EligibilityPanel() {
  const [rows, setRows] = useState<SubsidyEligibilityRow[]>([]);
  const [monthsInput, setMonthsInput] = useState('3');
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, eligibility] = await Promise.all([subsidyApi.getSettings(), subsidyApi.listEligibility()]);
      setMonthsInput(String(settings.eligibilityMonths));
      setRows(eligibility);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    mailTemplatesApi.list().then(setTemplates).catch(() => undefined);
  }, []);

  const handleSaveMonths = async () => {
    const n = Number(monthsInput);
    if (!Number.isInteger(n) || n < 1 || n > 36) {
      window.alert('1~36 사이의 정수를 입력하세요.');
      return;
    }
    setSavingSettings(true);
    try {
      await subsidyApi.updateSettings(n);
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
    setSelected(new Set(rows.filter((r) => r.eligible && r.workerEmail).map((r) => r.workerId)));
  };

  const handleBulkSend = async () => {
    if (!templateId) {
      window.alert('메일 템플릿을 선택하세요.');
      return;
    }
    const targets = rows.filter((r) => selected.has(r.workerId));
    if (targets.length === 0) {
      window.alert('발송 대상을 선택하세요.');
      return;
    }
    setSending(true);
    let success = 0;
    let fail = 0;
    const failMessages: string[] = [];
    for (const row of targets) {
      try {
        const logs = await mailApi.send({
          workerId: row.workerId,
          templateId,
          variables: {
            workerName: row.workerName,
            companyName: row.companyName ?? '',
            hireDate: row.hireDate,
            eligibleDate: row.eligibleDate,
          },
        });
        const failedLog = logs.find((log) => log.status !== 'SUCCESS');
        if (failedLog) {
          fail++;
          failMessages.push(`${row.workerName}: ${failedLog.errorMessage ?? '발송 실패'}`);
        } else {
          success++;
        }
      } catch (e) {
        fail++;
        failMessages.push(`${row.workerName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setSending(false);
    window.alert(
      `발송 완료: 성공 ${success}건 / 실패 ${fail}건` + (failMessages.length ? `\n${failMessages.join('\n')}` : ''),
    );
    setSelected(new Set());
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
            사용 가능 변수: {'{{workerName}}'} {'{{companyName}}'} {'{{hireDate}}'} {'{{eligibleDate}}'}
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
              <th>이메일</th>
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
                <td colSpan={7}>입사일이 등록된 근로자가 없습니다.</td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.workerId}>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!r.workerEmail}
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
                  <td>{r.workerEmail ?? '(이메일 없음)'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalculationPanel() {
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
      setCalculations(await subsidyApi.listCalculations());
    } catch (e) {
      setError(e instanceof Error ? e.message : '산정 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    workersApi.list().then(setWorkers).catch(() => undefined);
    load();
  }, []);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await subsidyApi.calculate({ workerId, periodLabel: periodLabel.trim(), workedDays: days });
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
