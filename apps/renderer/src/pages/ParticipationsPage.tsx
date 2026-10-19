import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CompanyRow,
  ParticipationWithNames,
  Worker,
  WorkerSubsidyValidationResult,
} from '@job-program/shared';
import { companiesApi } from '../api/companies';
import { workersApi } from '../api/workers';
import { participationsApi } from '../api/participations';
import {
  subsidyClaimsApi,
  type CalcResult,
  type RoundResult,
  type SubsidyClaim,
  type Verdict,
} from '../api/subsidy-claims';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { NextActionList } from '../components/NextActionList';
import { validationApi } from '../api/validation';

const won = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('ko-KR') + '원';

const today = (): string => new Date().toISOString().slice(0, 10);

const verdictLabel: Record<Verdict, string> = {
  PASS: '산정됨',
  NEEDS_REVIEW: '확인 필요',
  INSUFFICIENT_DATA: '자료 부족',
  NOT_APPLICABLE: '해당 없음',
};

const verdictBadge: Record<Verdict, string> = {
  PASS: 'badge badge-active',
  NEEDS_REVIEW: 'badge badge-warning',
  INSUFFICIENT_DATA: 'badge badge-pending',
  NOT_APPLICABLE: 'badge badge-inactive',
};

const benefitLabel: Record<string, string> = {
  INTERN: '인턴 지원금',
  HIRE: '채용 지원금',
};

/**
 * 기업 → 근로자 → 지원금 계단 화면.
 *
 * 왼쪽에서 기업을 고르면 그 기업의 근로자만, 근로자를 고르면 그 사람의 지원금만 보인다.
 * 산정은 서버의 정책 원장(SENIOR-2026-GENERAL)으로 계산되며, 이 화면은 결과를 보여주기만 한다.
 */
export function ParticipationsPage() {
  const { currentBusinessId } = useAuth();
  const businessId = currentBusinessId ?? '';

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [participations, setParticipations] = useState<ParticipationWithNames[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedParticipationId, setSelectedParticipationId] = useState<string | null>(null);

  const [calc, setCalc] = useState<CalcResult | null>(null);
  // 이 근로자의 지원금 '서류' 검증 결과. 산정(금액 계산)과는 별개다 —
  // 산정은 '얼마를 받을 수 있나', 검증은 '서류가 그걸 뒷받침하나'를 본다.
  const [docCheck, setDocCheck] = useState<WorkerSubsidyValidationResult | null>(null);
  const [docCheckNote, setDocCheckNote] = useState<string | null>(null);
  const [claims, setClaims] = useState<SubsidyClaim[]>([]);
  const [asOfDate, setAsOfDate] = useState<string>(today());

  const [loadingList, setLoadingList] = useState(false);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // --- 근로자 연결 폼 ---
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkedWorkers, setUnlinkedWorkers] = useState<Worker[]>([]);
  const [linkWorkerId, setLinkWorkerId] = useState('');
  const [linking, setLinking] = useState(false);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const selectedParticipation = useMemo(
    () => participations.find((p) => p.id === selectedParticipationId) ?? null,
    [participations, selectedParticipationId],
  );

  const show = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : '요청 중 문제가 발생했습니다.');

  const loadLists = useCallback(async () => {
    if (!businessId) return;
    setLoadingList(true);
    setError(null);
    try {
      const [cs, ps] = await Promise.all([
        companiesApi.list({ businessId }),
        participationsApi.list(businessId),
      ]);
      setCompanies(cs);
      setParticipations(ps);
    } catch (err) {
      show(err);
    } finally {
      setLoadingList(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadLists();
    // 사업이 바뀌면 선택을 전부 비운다. 이전 사업의 자료가 화면에 남지 않게 한다 (설계서 §14).
    setSelectedCompanyId(null);
    setSelectedParticipationId(null);
    setCalc(null);
    setClaims([]);
  }, [loadLists]);

  // 선택한 참여기록의 산정 결과와 저장된 신청 건을 불러온다.
  useEffect(() => {
    if (!businessId || !selectedParticipationId) {
      setCalc(null);
      setClaims([]);
      setDocCheck(null);
      setDocCheckNote(null);
      return;
    }
    let cancelled = false;
    setLoadingCalc(true);
    setError(null);
    void (async () => {
      try {
        const [c, cl] = await Promise.all([
          subsidyClaimsApi.preview(businessId, selectedParticipationId, asOfDate),
          subsidyClaimsApi.list(businessId, selectedParticipationId),
        ]);
        // 늦게 도착한 이전 선택의 응답을 새 화면에 표시하지 않는다 (설계서 §14).
        if (cancelled) return;
        setCalc(c);
        setClaims(cl);
      } catch (err) {
        if (!cancelled) show(err);
      } finally {
        if (!cancelled) setLoadingCalc(false);
      }

      // 지원금 서류 검증은 따로 부른다. 서류가 아직 안 들어왔으면 실패하는 게 정상이므로,
      // 실패해도 산정 화면은 그대로 두고 사유만 적어준다.
      const part = participations.find((x) => x.id === selectedParticipationId);
      if (!part?.companyId || !part?.workerId) return;
      try {
        const dc = await validationApi.workerSubsidy(part.companyId, part.workerId, businessId);
        if (!cancelled) {
          setDocCheck(dc);
          setDocCheckNote(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDocCheck(null);
          setDocCheckNote(
            err instanceof ApiError
              ? err.message
              : '지원금 서류 검증을 불러오지 못했습니다.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, selectedParticipationId, asOfDate]);

  const visibleParticipations = useMemo(
    () => (selectedCompanyId ? participations.filter((p) => p.companyId === selectedCompanyId) : participations),
    [participations, selectedCompanyId],
  );

  const participationCountByCompany = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of participations) m.set(p.companyId, (m.get(p.companyId) ?? 0) + 1);
    return m;
  }, [participations]);

  async function openLink() {
    if (!selectedCompany) return;
    setError(null);
    try {
      const ws = await workersApi.list({ businessId, companyId: selectedCompany.id });
      const linked = new Set(participations.map((p) => p.workerId));
      setUnlinkedWorkers(ws.filter((w) => !linked.has(w.id)));
      setLinkWorkerId('');
      setLinkOpen(true);
    } catch (err) {
      show(err);
    }
  }

  async function submitLink() {
    if (!selectedCompany?.companyBusiness || !linkWorkerId) return;
    setLinking(true);
    setError(null);
    try {
      await participationsApi.create({
        businessId,
        companyBusinessId: selectedCompany.companyBusiness.id,
        workerId: linkWorkerId,
      });
      setLinkOpen(false);
      setNotice('근로자를 이 사업에 연결했습니다.');
      await loadLists();
    } catch (err) {
      show(err);
    } finally {
      setLinking(false);
    }
  }

  async function generateClaims() {
    if (!businessId || !selectedParticipationId) return;
    setError(null);
    setNotice(null);
    try {
      const r = await subsidyClaimsApi.generate(businessId, selectedParticipationId, asOfDate);
      setClaims(await subsidyClaimsApi.list(businessId, selectedParticipationId));
      setNotice(
        `지원금 신청 ${r.created.length}건을 저장했습니다.` +
          (r.skipped.length ? ` (${r.skipped.length}건은 저장하지 않았습니다 — 아래 사유 참고)` : ''),
      );
    } catch (err) {
      show(err);
    }
  }

  async function removeClaim(id: string) {
    if (!businessId) return;
    setError(null);
    try {
      await subsidyClaimsApi.remove(businessId, id);
      setClaims(await subsidyClaimsApi.list(businessId, selectedParticipationId ?? undefined));
      setNotice('신청 건을 삭제했습니다.');
    } catch (err) {
      show(err);
    }
  }

  if (!businessId) {
    return (
      <div className="page">
        <p className="hint-text">사업을 먼저 선택하세요.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-left">
          <h2>참여자 · 지원금</h2>
          <span className="hint-text">기업을 고르면 그 기업의 근로자만, 근로자를 고르면 그 사람의 지원금만 보입니다.</span>
        </div>
        <div className="actions">
          <label className="hint-text" htmlFor="asOf">
            기준일
          </label>
          <input
            id="asOf"
            type="date"
            className="text-input"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value || today())}
          />
          <button type="button" className="btn" onClick={() => void loadLists()} disabled={loadingList}>
            새로고침
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="hint-text">{notice}</p>}

      <div className="cascade">
        {/* 1단 — 기업 */}
        <section className="card cascade-col">
          <h3>
            기업 <span className="hint-text">{companies.length}곳</span>
          </h3>
          <ul className="pick-list">
            <li>
              <button
                type="button"
                className={selectedCompanyId === null ? 'pick-item is-active' : 'pick-item'}
                onClick={() => {
                  setSelectedCompanyId(null);
                  setSelectedParticipationId(null);
                }}
              >
                <strong>전체 보기</strong>
                <span className="hint-text">참여자 {participations.length}명</span>
              </button>
            </li>
            {companies.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={selectedCompanyId === c.id ? 'pick-item is-active' : 'pick-item'}
                  onClick={() => {
                    setSelectedCompanyId(c.id);
                    setSelectedParticipationId(null);
                  }}
                >
                  <strong>{c.name}</strong>
                  <span className="hint-text">
                    참여자 {participationCountByCompany.get(c.id) ?? 0}명
                    {!c.companyBusiness && ' · 사업 미참여'}
                  </span>
                </button>
              </li>
            ))}
            {companies.length === 0 && !loadingList && (
              <li className="hint-text pad">등록된 기업이 없습니다.</li>
            )}
          </ul>
        </section>

        {/* 2단 — 근로자(참여기록) */}
        <section className="card cascade-col">
          <h3>
            근로자 <span className="hint-text">{visibleParticipations.length}명</span>
          </h3>
          {selectedCompany && (
            <div className="actions pad-bottom">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void openLink()}
                disabled={!selectedCompany.companyBusiness}
                title={
                  selectedCompany.companyBusiness
                    ? '이 기업의 근로자를 사업에 연결합니다'
                    : '이 기업이 아직 사업에 참여하지 않았습니다. 기업 DB에서 먼저 사업 참여를 등록하세요.'
                }
              >
                + 근로자 연결
              </button>
            </div>
          )}
          <ul className="pick-list">
            {visibleParticipations.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={selectedParticipationId === p.id ? 'pick-item is-active' : 'pick-item'}
                  onClick={() => setSelectedParticipationId(p.id)}
                >
                  <strong>{p.workerName}</strong>
                  <span className="hint-text">
                    {p.companyName} · 입사 {p.hireDate ?? '—'}
                    {p.salary ? ` · 급여 ${won(p.salary)}` : ''}
                  </span>
                </button>
              </li>
            ))}
            {visibleParticipations.length === 0 && !loadingList && (
              <li className="hint-text pad">
                {selectedCompany ? '이 기업에 연결된 참여자가 없습니다.' : '참여자가 없습니다.'}
              </li>
            )}
          </ul>
        </section>

        {/* 3단 — 지원금 */}
        <section className="card cascade-col cascade-wide">
          <h3>지원금</h3>
          {!selectedParticipation && <p className="hint-text pad">근로자를 선택하세요.</p>}

          {selectedParticipation && loadingCalc && <p className="hint-text pad">계산 중...</p>}

          {/*
            지원금 '서류' 검증.
            산정(얼마 받나)과 **독립적으로** 띄운다 — 정책 원장이 없어 산정이 실패해도
            서류 미비·오기입은 보여야 한다. 전에는 산정 블록 안에 있어서 산정이 실패하면
            같이 사라졌다(2026-10-19 사용자 보고: "오류사항이 보이지 않는데").
          */}
          {selectedParticipation && !loadingCalc && (
            <SubsidyDocCheck result={docCheck} note={docCheckNote} />
          )}

          {selectedParticipation && !loadingCalc && calc && (
            <>
              <div className="calc-head">
                <div>
                  <strong>{selectedParticipation.workerName}</strong>
                  <span className="hint-text">
                    {' '}
                    · {selectedParticipation.companyName} · 월급여 {won(calc.input.monthlySalaryWon)}
                  </span>
                </div>
                <div className="hint-text">
                  기준일 {calc.input.asOfDate} · 정책 {calc.policyId} v{calc.policyVersion}
                </div>
              </div>

              <div className="calc-total">
                산정 합계 <strong>{won(calc.grandTotalWon)}</strong>
              </div>

              {calc.capWarning && <p className="error-text">{calc.capWarning}</p>}

              {calc.benefits.map((b) => (
                <div key={b.benefitType} className="benefit-block">
                  <div className="benefit-head">
                    <strong>{benefitLabel[b.benefitType] ?? b.label}</strong>
                    <span className={verdictBadge[b.verdict]}>{verdictLabel[b.verdict]}</span>
                    <span className="hint-text">{won(b.totalWon)}</span>
                  </div>
                  {b.rounds.length === 0 ? (
                    <p className="hint-text pad">{b.reason}</p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>회차</th>
                          <th>기간</th>
                          <th>상태</th>
                          <th className="num">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.rounds.map((r) => (
                          <RoundRow key={r.round} r={r} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}

              <div className="actions pad-top">
                <button type="button" className="btn btn-primary" onClick={() => void generateClaims()}>
                  산정 결과를 신청 건으로 저장
                </button>
                <span className="hint-text">
                  '산정됨'인 회차만 저장됩니다. 저장은 신청·승인·지급과 별개입니다.
                </span>
              </div>

              {claims.length > 0 && (
                <div className="benefit-block">
                  <div className="benefit-head">
                    <strong>저장된 신청 건</strong>
                    <span className="hint-text">{claims.length}건</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>유형</th>
                        <th>회차</th>
                        <th>기간</th>
                        <th className="num">산정액</th>
                        <th className="num">승인액</th>
                        <th className="num">지급액</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map((c) => (
                        <tr key={c.id}>
                          <td>{benefitLabel[c.benefitType] ?? c.benefitType}</td>
                          <td>{c.round}회차</td>
                          <td>
                            {c.periodStart} ~ {c.periodEnd}
                          </td>
                          <td className="num">{won(c.calculatedAmountWon)}</td>
                          <td className="num">{won(c.approvedAmountWon)}</td>
                          <td className="num">{won(c.paidAmountWon)}</td>
                          <td className="actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => void removeClaim(c.id)}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="hint-text pad">
                    승인액·지급액은 아직 입력 화면이 없습니다. 승인과 실제 지급은 서로 다른 사실이라 따로 기록합니다.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {linkOpen && (
        <Modal title="근로자를 사업에 연결" onClose={() => setLinkOpen(false)}>
          <p className="hint-text">
            {selectedCompany?.name}의 근로자 중 아직 이 사업에 연결되지 않은 사람만 보입니다.
          </p>
          {unlinkedWorkers.length === 0 ? (
            <p className="hint-text pad">
              연결할 근로자가 없습니다. 근로자 관리 화면에서 먼저 등록하세요.
            </p>
          ) : (
            <select
              className="select-input"
              value={linkWorkerId}
              onChange={(e) => setLinkWorkerId(e.target.value)}
            >
              <option value="">근로자를 선택하세요</option>
              {unlinkedWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.birthDate})
                </option>
              ))}
            </select>
          )}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setLinkOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitLink()}
              disabled={!linkWorkerId || linking}
            >
              {linking ? '연결 중...' : '연결'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoundRow({ r }: { r: RoundResult }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td>{r.round}회차</td>
        <td>
          {r.periodStart} ~ {r.periodEnd}
        </td>
        <td>
          <span className={verdictBadge[r.verdict]}>{verdictLabel[r.verdict]}</span>
          {r.proRata && <span className="badge badge-info">일할</span>}
        </td>
        <td className="num">
          {won(r.amountWon)}
          <button type="button" className="btn btn-sm link-btn" onClick={() => setOpen((v) => !v)}>
            {open ? '근거 닫기' : '근거'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="reason-cell">
            {r.reason}
            {r.proRata && (
              <div className="hint-text">
                인정일수 {r.proRata.coveredDays}/{r.proRata.totalDays}일 · 일할급여{' '}
                {won(r.proRata.proRatedSalaryWon)} · 지급률 적용 {won(r.proRata.beforeCapWon)}
                {r.proRata.capApplied && ' · 월 상한 적용됨'}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * 이 근로자의 지원금 증빙서류 검증 결과.
 *
 * 「다음에 하실 일」이 먼저 나오고, 그 아래에 근거(서류 체크리스트·규칙 판정)를 접어둔다.
 * 담당자가 알고 싶은 건 "이 사람이 받으려면 내가 뭘 해야 하나"지, 규칙 목록이 아니다.
 */
function SubsidyDocCheck({
  result,
  note,
}: {
  result: WorkerSubsidyValidationResult | null;
  note: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (note) {
    return (
      <div className="benefit-block">
        <div className="benefit-head">
          <strong>지원금 증빙서류 검증</strong>
        </div>
        <p className="hint-text pad">{note}</p>
      </div>
    );
  }
  if (!result) return null;

  const missing = result.documents.filter((d) => !d.optional && (!d.present || !d.analyzed));
  const flagged = [...result.companyRules, ...result.workerRules].filter((r) => r.verdict !== 'PASS');
  const statusLabel: Record<string, string> = {
    COMPLETE: '서류 이상 없음',
    NEEDS_REVIEW: '확인 필요',
    MISSING: '서류 미비',
    RISK: '지급 불가 사유',
  };
  const statusClass: Record<string, string> = {
    COMPLETE: 'badge-active',
    NEEDS_REVIEW: 'badge-warning',
    MISSING: 'badge-failed',
    RISK: 'badge-failed',
  };

  return (
    <div className="benefit-block">
      <div className="benefit-head">
        <strong>지원금 증빙서류 검증</strong>
        <span className={`badge ${statusClass[result.status] ?? 'badge-inactive'}`}>
          {statusLabel[result.status] ?? result.status}
        </span>
        <span className="hint-text">
          미비 {missing.length}건 · 지적 {flagged.length}건
        </span>
      </div>

      <NextActionList actions={result.nextActions ?? []} />

      <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
        {open ? '근거 접기' : '근거 보기 (서류 체크리스트 · 규칙 판정)'}
      </button>

      {open && (
        <>
          <p style={{ margin: '0.6rem 0 0.3rem', fontWeight: 600 }}>
            지원금 필수서류 <span className="hint-text">(기업이 제출 — 없으면 이 기업 전원이 막힙니다)</span>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {result.documents.map((d) => (
              <li key={d.documentType}>
                <span
                  className={`badge ${d.present && d.analyzed ? 'badge-active' : d.optional ? 'badge-inactive' : 'badge-failed'}`}
                >
                  {d.present ? (d.analyzed ? '제출' : '미분석') : '미제출'}
                </span>{' '}
                {d.label}
                {d.optional && <span className="hint-text"> (선택)</span>}
              </li>
            ))}
          </ul>

          <p style={{ margin: '0.7rem 0 0.3rem', fontWeight: 600 }}>
            이 근로자 규칙 <span className="hint-text">({result.workerRules.length}건)</span>
          </p>
          <RuleLines rules={result.workerRules} />

          <p style={{ margin: '0.7rem 0 0.3rem', fontWeight: 600 }}>
            기업 공통 규칙 <span className="hint-text">({result.companyRules.length}건 — 전원에게 적용)</span>
          </p>
          <RuleLines rules={result.companyRules} />
        </>
      )}
    </div>
  );
}

function RuleLines({ rules }: { rules: WorkerSubsidyValidationResult['workerRules'] }) {
  if (rules.length === 0) return <p className="hint-text pad">해당 규칙 없음</p>;
  const cls: Record<string, string> = {
    PASS: 'badge-active',
    NEEDS_REVIEW: 'badge-warning',
    FAIL: 'badge-failed',
  };
  const label: Record<string, string> = { PASS: '통과', NEEDS_REVIEW: '확인필요', FAIL: '위험' };
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
      {rules.map((r) => (
        <li key={r.ruleId} style={{ fontSize: '0.86rem' }}>
          <span className={`badge ${cls[r.verdict] ?? 'badge-inactive'}`}>{label[r.verdict] ?? r.verdict}</span>{' '}
          <span className="hint-text">{r.ruleId}</span> {r.label}
          {r.message && <div className="hint-text" style={{ paddingLeft: '0.2rem' }}>{r.message}</div>}
        </li>
      ))}
    </ul>
  );
}
