import { useEffect, useMemo, useRef, useState } from 'react';
import { CompanyStatus, type Company } from '@job-program/shared';
import { companiesApi, type CompanyInput } from '../api/companies';
import type { ImportSummary } from '../api/client';
import { Modal } from '../components/Modal';
import { ImportResultModal } from '../components/ImportResultModal';

const emptyForm: CompanyInput = {
  name: '',
  businessRegistrationNumber: '',
  representativeName: '',
  industryType: '',
  address: '',
  phone: '',
  contactManagerName: '',
  contactManagerPhone: '',
  contactManagerEmail: '',
  status: CompanyStatus.ACTIVE,
  memo: '',
};

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async (kw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await companiesApi.list(kw);
      setCompanies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '기업 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditing(company);
    setForm({
      name: company.name,
      businessRegistrationNumber: company.businessRegistrationNumber,
      representativeName: company.representativeName ?? '',
      industryType: company.industryType ?? '',
      address: company.address ?? '',
      phone: company.phone ?? '',
      contactManagerName: company.contactManagerName ?? '',
      contactManagerPhone: company.contactManagerPhone ?? '',
      contactManagerEmail: company.contactManagerEmail ?? '',
      status: company.status,
      memo: company.memo ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await companiesApi.update(editing.id, form);
      } else {
        await companiesApi.create(form);
      }
      setModalOpen(false);
      await load(keyword);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company: Company) => {
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
      const summary = await companiesApi.importExcel(file);
      setImportSummary(summary);
      await load(keyword);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '엑셀 업로드에 실패했습니다.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            className="search-input"
            placeholder="기업명 · 사업자등록번호 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load(keyword);
            }}
          />
          <button className="btn" onClick={() => load(keyword)}>
            검색
          </button>
        </div>
        <div className="toolbar-left">
          <button
            className="btn"
            onClick={() => window.alert('준비 중인 기능입니다. 워크넷·크레탑 등 외부 API 연동을 통한 신규 기업 DB 자동구축이 추후 제공될 예정입니다.')}
          >
            기업 DB 자동구축 (준비중)
          </button>
          <button className="btn" onClick={() => companiesApi.exportExcel()}>
            엑셀 다운로드
          </button>
          <button className="btn" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? '업로드 중...' : '엑셀 업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
          <button className="btn btn-primary" onClick={openCreate}>
            + 기업 추가
          </button>
        </div>
      </div>

      {importSummary && (
        <ImportResultModal summary={importSummary} onClose={() => setImportSummary(null)} />
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>기업명</th>
              <th>사업자등록번호</th>
              <th>대표자</th>
              <th>업종</th>
              <th>담당자</th>
              <th>담당자 연락처</th>
              <th>담당자 이메일</th>
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
                  <td>{c.businessRegistrationNumber}</td>
                  <td>{c.representativeName || '-'}</td>
                  <td>{c.industryType || '-'}</td>
                  <td>{c.contactManagerName || '-'}</td>
                  <td>{c.contactManagerPhone || '-'}</td>
                  <td>{c.contactManagerEmail || '-'}</td>
                  <td>
                    <span className={`badge ${c.status === CompanyStatus.ACTIVE ? 'badge-active' : 'badge-inactive'}`}>
                      {c.status === CompanyStatus.ACTIVE ? '운영중' : '중지'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => openEdit(c)}>
                      수정
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
                <label className="required">사업자등록번호 (하이픈 없이 10자리)</label>
                <input
                  className="text-input"
                  required
                  pattern="\d{10}"
                  title="숫자 10자리를 입력하세요."
                  value={form.businessRegistrationNumber}
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
                <label>업종</label>
                <input
                  className="text-input"
                  value={form.industryType ?? ''}
                  onChange={(e) => setForm({ ...form, industryType: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>주소</label>
                <input
                  className="text-input"
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="field">
                <label>기업 전화번호</label>
                <input
                  className="text-input"
                  value={form.phone ?? ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
              <div className="field">
                <label>담당자명</label>
                <input
                  className="text-input"
                  value={form.contactManagerName ?? ''}
                  onChange={(e) => setForm({ ...form, contactManagerName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>담당자 연락처</label>
                <input
                  className="text-input"
                  value={form.contactManagerPhone ?? ''}
                  onChange={(e) => setForm({ ...form, contactManagerPhone: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>담당자 이메일 (메일 발송 시 사용)</label>
                <input
                  className="text-input"
                  type="email"
                  value={form.contactManagerEmail ?? ''}
                  onChange={(e) => setForm({ ...form, contactManagerEmail: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>메모</label>
                <textarea
                  className="textarea-input"
                  rows={3}
                  value={form.memo ?? ''}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                />
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
    </div>
  );
}
