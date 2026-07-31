import { useEffect, useMemo, useRef, useState } from 'react';
import { CompanyStatus, type CompanyRow } from '@job-program/shared';
import { companiesApi, type CompanyInput, type DedupeGroup, type ContactNormalizePreviewRow, type UpsertCompanyBusinessInput } from '../api/companies';
import type { ImportSummary } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { ImportResultModal } from '../components/ImportResultModal';

const emptyForm: CompanyInput = {
  name: '',
  businessRegistrationNumber: '',
  representativeName: '',
  phone: '',
  email: '',
  fax: '',
  industryType: '',
  address: '',
  status: CompanyStatus.ACTIVE,
  memo: '',
};

const emptyBusinessForm: Omit<UpsertCompanyBusinessInput, 'businessId'> = {
  participationType: '',
  plannedHeadcount: undefined,
  generalTypeHeadcount: undefined,
  intergenerationalTypeHeadcount: undefined,
  agreementSentDate: '',
  agreementDate: '',
  agreementConcluded: false,
  businessPlanRegistered: false,
  documentGuideSent: false,
  participantApplied: false,
};

export function CompaniesPage() {
  const { currentBusinessId } = useAuth();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [contactableOnly, setContactableOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState<CompanyInput>(emptyForm);
  const [businessForm, setBusinessForm] = useState<Omit<UpsertCompanyBusinessInput, 'businessId'>>(emptyBusinessForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dedupeOpen, setDedupeOpen] = useState(false);
  const [dedupeGroups, setDedupeGroups] = useState<DedupeGroup[]>([]);
  const [dedupeLoading, setDedupeLoading] = useState(false);

  const [normalizeOpen, setNormalizeOpen] = useState(false);
  const [normalizeRows, setNormalizeRows] = useState<ContactNormalizePreviewRow[]>([]);
  const [normalizeLoading, setNormalizeLoading] = useState(false);

  const load = async (kw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await companiesApi.list({ keyword: kw, businessId: currentBusinessId ?? undefined, contactableOnly });
      setCompanies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '기업 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, contactableOnly]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setBusinessForm(emptyBusinessForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (company: CompanyRow) => {
    setEditing(company);
    setForm({
      name: company.name,
      businessRegistrationNumber: company.businessRegistrationNumber ?? '',
      representativeName: company.representativeName ?? '',
      phone: company.phone ?? '',
      email: company.email ?? '',
      fax: company.fax ?? '',
      industryType: company.industryType ?? '',
      address: company.address ?? '',
      status: company.status,
      memo: company.memo ?? '',
    });
    const cb = company.companyBusiness;
    setBusinessForm({
      participationType: cb?.participationType ?? '',
      plannedHeadcount: cb?.plannedHeadcount ?? undefined,
      generalTypeHeadcount: cb?.generalTypeHeadcount ?? undefined,
      intergenerationalTypeHeadcount: cb?.intergenerationalTypeHeadcount ?? undefined,
      agreementSentDate: cb?.agreementSentDate ?? '',
      agreementDate: cb?.agreementDate ?? '',
      agreementConcluded: cb?.agreementConcluded ?? false,
      businessPlanRegistered: cb?.businessPlanRegistered ?? false,
      documentGuideSent: cb?.documentGuideSent ?? false,
      participantApplied: cb?.participantApplied ?? false,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const companyId = editing ? editing.id : (await companiesApi.create(form)).id;
      if (editing) await companiesApi.update(editing.id, form);
      if (currentBusinessId) {
        await companiesApi.upsertBusiness(companyId, { businessId: currentBusinessId, ...businessForm });
      }
      setModalOpen(false);
      await load(keyword);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company: CompanyRow) => {
    if (!window.confirm(`'${company.name}' 기업을 삭제하시겠습니까?`)) return;
    try {
      await companiesApi.remove(company.id);
      await load(keyword);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const rows = useMemo(() => companies, [companies]);

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const summary = await companiesApi.importExcel(file, currentBusinessId ?? undefined);
      setImportSummary(summary);
      await load(keyword);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '엑셀 업로드에 실패했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const openDedupe = async () => {
    setDedupeOpen(true);
    setDedupeLoading(true);
    try {
      setDedupeGroups(await companiesApi.previewDedupe());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '중복 조회에 실패했습니다.');
    } finally {
      setDedupeLoading(false);
    }
  };

  const confirmDedupe = async () => {
    setDedupeLoading(true);
    try {
      const result = await companiesApi.confirmDedupe();
      window.alert(`${result.merged}건을 병합했습니다.`);
      setDedupeOpen(false);
      await load(keyword);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '병합에 실패했습니다.');
    } finally {
      setDedupeLoading(false);
    }
  };

  const openNormalize = async () => {
    setNormalizeOpen(true);
    setNormalizeLoading(true);
    try {
      setNormalizeRows(await companiesApi.previewNormalizeContacts());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '정규화 대상 조회에 실패했습니다.');
    } finally {
      setNormalizeLoading(false);
    }
  };

  const confirmNormalize = async () => {
    setNormalizeLoading(true);
    try {
      const result = await companiesApi.confirmNormalizeContacts();
      window.alert(`${result.updated}개 기업의 연락처를 정규화했습니다.`);
      setNormalizeOpen(false);
      await load(keyword);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '정규화 적용에 실패했습니다.');
    } finally {
      setNormalizeLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            className="search-input"
            placeholder="기업명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load(keyword);
            }}
          />
          <button className="btn" onClick={() => load(keyword)}>
            검색
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={contactableOnly} onChange={(e) => setContactableOnly(e.target.checked)} />
            연락불가 기업만
          </label>
        </div>
        <div className="toolbar-left">
          <button
            className="btn"
            onClick={() => window.alert('준비 중인 기능입니다. 워크넷·크레탑 등 외부 API 연동을 통한 신규 기업 DB 자동구축이 추후 제공될 예정입니다.')}
          >
            API 수집 시작 (준비중)
          </button>
          <button className="btn" onClick={openDedupe}>
            중복 제거
          </button>
          <button className="btn" onClick={openNormalize}>
            연락처 정규화
          </button>
          <button className="btn" onClick={() => companiesApi.exportExcel(currentBusinessId ?? undefined)}>
            엑셀 내보내기
          </button>
          <button className="btn" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? '업로드 중...' : '엑셀 불러오기'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
          <button className="btn btn-primary" onClick={openCreate}>
            + 기업 수동 추가
          </button>
        </div>
      </div>

      {importSummary && <ImportResultModal summary={importSummary} onClose={() => setImportSummary(null)} />}

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>기업명</th>
              <th>사업자등록번호</th>
              <th>대표자</th>
              <th>연락처</th>
              <th>이메일</th>
              <th>연락가능</th>
              <th>사업 진행상태</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={9}>불러오는 중...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={9}>등록된 기업이 없습니다.</td>
              </tr>
            )}
            {!loading &&
              rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.businessRegistrationNumber || '-'}</td>
                  <td>{c.representativeName || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.email || '-'}</td>
                  <td>
                    <span className={`badge ${c.contactable ? 'badge-active' : 'badge-failed'}`}>
                      {c.contactable ? '연락가능' : '연락불가'}
                    </span>
                  </td>
                  <td>
                    {c.companyBusiness ? (
                      <span className="hint-text">
                        {c.companyBusiness.agreementConcluded ? '협약체결 ' : ''}
                        {c.companyBusiness.businessPlanRegistered ? '· 계획등록 ' : ''}
                        {c.companyBusiness.participantApplied ? '· 참여자신청' : ''}
                        {!c.companyBusiness.agreementConcluded &&
                        !c.companyBusiness.businessPlanRegistered &&
                        !c.companyBusiness.participantApplied
                          ? '-'
                          : ''}
                      </span>
                    ) : (
                      <span className="hint-text">-</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${c.status === CompanyStatus.ACTIVE ? 'badge-active' : 'badge-inactive'}`}>
                      {c.status === CompanyStatus.ACTIVE ? '운영중' : '중지'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => openEdit(c)}>
                      수정
                    </button>
                    <button
                      className="btn btn-sm"
                      title="준비 중인 기능입니다. TODO(다음지시서): 모집(3단계) 연동"
                      disabled
                    >
                      모집으로 넘기기
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? '기업 정보 수정' : '기업 추가'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginTop: 0, fontSize: '0.9rem' }}>기업 정보</h3>
            <div className="form-grid">
              <div className="field">
                <label className="required">기업명</label>
                <input
                  className="text-input"
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>사업자등록번호</label>
                <input
                  className="text-input"
                  placeholder="123-45-67890"
                  value={form.businessRegistrationNumber ?? ''}
                  onChange={(e) => setForm({ ...form, businessRegistrationNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>대표자명</label>
                <input
                  className="text-input"
                  value={form.representativeName ?? ''}
                  onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
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
                <label>이메일</label>
                <input
                  className="text-input"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>팩스</label>
                <input
                  className="text-input"
                  value={form.fax ?? ''}
                  onChange={(e) => setForm({ ...form, fax: e.target.value })}
                />
              </div>
              <div className="field">
                <label>업종</label>
                <input
                  className="text-input"
                  value={form.industryType ?? ''}
                  onChange={(e) => setForm({ ...form, industryType: e.target.value })}
                />
              </div>
              <div className="field">
                <label>상태</label>
                <select
                  className="select-input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as CompanyStatus })}
                >
                  <option value={CompanyStatus.ACTIVE}>운영중</option>
                  <option value={CompanyStatus.INACTIVE}>중지</option>
                </select>
              </div>
              <div className="field full">
                <label>주소</label>
                <input
                  className="text-input"
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>메모</label>
                <textarea
                  className="textarea-input"
                  rows={2}
                  value={form.memo ?? ''}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                />
              </div>
            </div>

            <h3 style={{ fontSize: '0.9rem' }}>현재 사업 진행상태</h3>
            {!currentBusinessId && <p className="hint-text">선택된 사업이 없어 진행상태는 저장되지 않습니다.</p>}
            <div className="form-grid">
              <div className="field">
                <label>참여유형</label>
                <input
                  className="text-input"
                  placeholder="예: 일반형, 세대통합형"
                  value={businessForm.participationType ?? ''}
                  onChange={(e) => setBusinessForm({ ...businessForm, participationType: e.target.value })}
                />
              </div>
              <div className="field">
                <label>예정인원</label>
                <input
                  className="text-input"
                  type="number"
                  value={businessForm.plannedHeadcount ?? ''}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      plannedHeadcount: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="field">
                <label>일반형 인원</label>
                <input
                  className="text-input"
                  type="number"
                  value={businessForm.generalTypeHeadcount ?? ''}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      generalTypeHeadcount: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="field">
                <label>세대통합형 인원</label>
                <input
                  className="text-input"
                  type="number"
                  value={businessForm.intergenerationalTypeHeadcount ?? ''}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      intergenerationalTypeHeadcount: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="field">
                <label>협약발송일</label>
                <input
                  className="text-input"
                  type="date"
                  value={businessForm.agreementSentDate ?? ''}
                  onChange={(e) => setBusinessForm({ ...businessForm, agreementSentDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>협약일</label>
                <input
                  className="text-input"
                  type="date"
                  value={businessForm.agreementDate ?? ''}
                  onChange={(e) => setBusinessForm({ ...businessForm, agreementDate: e.target.value })}
                />
              </div>
              <div className="field full" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="checkbox"
                    checked={businessForm.agreementConcluded ?? false}
                    onChange={(e) => setBusinessForm({ ...businessForm, agreementConcluded: e.target.checked })}
                  />
                  협약체결
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="checkbox"
                    checked={businessForm.businessPlanRegistered ?? false}
                    onChange={(e) => setBusinessForm({ ...businessForm, businessPlanRegistered: e.target.checked })}
                  />
                  사업계획등록
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="checkbox"
                    checked={businessForm.documentGuideSent ?? false}
                    onChange={(e) => setBusinessForm({ ...businessForm, documentGuideSent: e.target.checked })}
                  />
                  서류안내
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="checkbox"
                    checked={businessForm.participantApplied ?? false}
                    onChange={(e) => setBusinessForm({ ...businessForm, participantApplied: e.target.checked })}
                  />
                  참여자신청
                </label>
              </div>
            </div>

            {formError && <p className="error-text">{formError}</p>}

            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setModalOpen(false)}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dedupeOpen && (
        <Modal title="중복 제거 (사업자등록번호 기준)" onClose={() => setDedupeOpen(false)}>
          {dedupeLoading && <p className="hint-text">불러오는 중...</p>}
          {!dedupeLoading && dedupeGroups.length === 0 && <p className="hint-text">중복된 기업이 없습니다.</p>}
          {!dedupeLoading && dedupeGroups.length > 0 && (
            <>
              <p className="hint-text">
                총 {dedupeGroups.length}건의 사업자등록번호가 중복됩니다. 확정하면 각 그룹에서 가장 먼저 등록된
                기업을 남기고 나머지를 병합·삭제합니다. 근로자·사업 진행상태는 남는 기업으로 옮겨집니다.
              </p>
              <div className="card" style={{ marginTop: '0.75rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>일치 기준</th>
                      <th>남기는 기업</th>
                      <th>병합될 기업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dedupeGroups.map((g) => (
                      <tr key={`${g.matchType}-${g.matchValue}`}>
                        <td>
                          {g.matchType === 'businessRegistrationNumber' ? '사업자등록번호' : '기업명'}: {g.matchValue}
                        </td>
                        <td>{g.keeper.name}</td>
                        <td>{g.duplicates.map((d) => d.name).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="btn" onClick={() => setDedupeOpen(false)}>
                  취소
                </button>
                <button className="btn btn-primary" disabled={dedupeLoading} onClick={confirmDedupe}>
                  {dedupeLoading ? '처리 중...' : '병합 확정'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {normalizeOpen && (
        <Modal title="연락처 정규화" onClose={() => setNormalizeOpen(false)}>
          {normalizeLoading && <p className="hint-text">불러오는 중...</p>}
          {!normalizeLoading && normalizeRows.length === 0 && (
            <p className="hint-text">정규화가 필요한 연락처가 없습니다.</p>
          )}
          {!normalizeLoading && normalizeRows.length > 0 && (
            <>
              <p className="hint-text">아래 {normalizeRows.length}건의 형식을 통일된 형식으로 바꿉니다.</p>
              <div className="card" style={{ marginTop: '0.75rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>기업명</th>
                      <th>항목</th>
                      <th>변경 전</th>
                      <th>변경 후</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalizeRows.map((r, i) => (
                      <tr key={`${r.id}-${r.field}-${i}`}>
                        <td>{r.name}</td>
                        <td>{r.field === 'phone' ? '연락처' : r.field === 'fax' ? '팩스' : '이메일'}</td>
                        <td>{r.before}</td>
                        <td>{r.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="btn" onClick={() => setNormalizeOpen(false)}>
                  취소
                </button>
                <button className="btn btn-primary" disabled={normalizeLoading} onClick={confirmNormalize}>
                  {normalizeLoading ? '처리 중...' : '적용 확정'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
