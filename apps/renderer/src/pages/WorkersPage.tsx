import { useEffect, useMemo, useRef, useState } from 'react';
import { ContractType, Gender, WorkerStatus, type Company, type Worker } from '@job-program/shared';
import { workersApi, type WorkerInput } from '../api/workers';
import { companiesApi } from '../api/companies';
import type { ImportSummary } from '../api/client';
import { Modal } from '../components/Modal';
import { ImportResultModal } from '../components/ImportResultModal';

const emptyForm: WorkerInput = {
  name: '',
  birthDate: '',
  gender: undefined,
  phone: '',
  email: '',
  address: '',
  companyId: undefined,
  position: '',
  contractType: undefined,
  hireDate: '',
  resignDate: '',
  salary: undefined,
  status: WorkerStatus.ACTIVE,
  memo: '',
};

const genderLabel: Record<Gender, string> = {
  [Gender.MALE]: '남',
  [Gender.FEMALE]: '여',
};

const contractLabel: Record<ContractType, string> = {
  [ContractType.FULL_TIME]: '정규직',
  [ContractType.PART_TIME]: '단시간',
  [ContractType.DAILY]: '일용직',
};

const statusLabel: Record<WorkerStatus, string> = {
  [WorkerStatus.ACTIVE]: '재직',
  [WorkerStatus.ON_LEAVE]: '휴직',
  [WorkerStatus.RESIGNED]: '퇴사',
};

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [form, setForm] = useState<WorkerInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const load = async (kw?: string, companyId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await workersApi.list({ keyword: kw, companyId: companyId || undefined });
      setWorkers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '근로자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      setCompanies(await companiesApi.list());
    } catch {
      // 기업 목록 로드 실패는 근로자 화면 자체 오류로 표시하지 않음
    }
  };

  useEffect(() => {
    load();
    loadCompanies();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (worker: Worker) => {
    setEditing(worker);
    setForm({
      name: worker.name,
      birthDate: worker.birthDate,
      gender: worker.gender ?? undefined,
      phone: worker.phone ?? '',
      email: worker.email ?? '',
      address: worker.address ?? '',
      companyId: worker.companyId ?? undefined,
      position: worker.position ?? '',
      contractType: worker.contractType ?? undefined,
      hireDate: worker.hireDate ?? '',
      resignDate: worker.resignDate ?? '',
      salary: worker.salary ?? undefined,
      status: worker.status,
      memo: worker.memo ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload: Partial<WorkerInput> = {
        ...form,
        companyId: form.companyId || undefined,
        hireDate: form.hireDate || undefined,
        resignDate: form.resignDate || undefined,
        salary: form.salary === undefined || (form.salary as unknown as string) === '' ? undefined : Number(form.salary),
      };
      if (editing) {
        await workersApi.update(editing.id, payload);
      } else {
        await workersApi.create(payload);
      }
      setModalOpen(false);
      await load(keyword, companyFilter);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (worker: Worker) => {
    if (!window.confirm(`'${worker.name}' 근로자를 삭제하시겠습니까?`)) return;
    try {
      await workersApi.remove(worker.id);
      await load(keyword, companyFilter);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const summary = await workersApi.importExcel(file);
      setImportSummary(summary);
      await load(keyword, companyFilter);
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
            placeholder="이름 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load(keyword, companyFilter);
            }}
          />
          <select
            className="select-input"
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              load(keyword, e.target.value);
            }}
          >
            <option value="">전체 기업</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => load(keyword, companyFilter)}>
            검색
          </button>
        </div>
        <div className="toolbar-left">
          <button className="btn" onClick={() => workersApi.exportExcel()}>
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
            + 근로자 추가
          </button>
        </div>
      </div>

      {importSummary && <ImportResultModal summary={importSummary} onClose={() => setImportSummary(null)} />}

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>생년월일</th>
              <th>성별</th>
              <th>소속기업</th>
              <th>직급</th>
              <th>계약형태</th>
              <th>입사일</th>
              <th>연락처</th>
              <th>이메일</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={11}>불러오는 중...</td>
              </tr>
            )}
            {!loading && workers.length === 0 && (
              <tr className="empty-row">
                <td colSpan={11}>등록된 근로자가 없습니다.</td>
              </tr>
            )}
            {!loading &&
              workers.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.birthDate}</td>
                  <td>{w.gender ? genderLabel[w.gender] : '-'}</td>
                  <td>{w.companyId ? companyMap.get(w.companyId) ?? '-' : '-'}</td>
                  <td>{w.position || '-'}</td>
                  <td>{w.contractType ? contractLabel[w.contractType] : '-'}</td>
                  <td>{w.hireDate || '-'}</td>
                  <td>{w.phone || '-'}</td>
                  <td>{w.email || '-'}</td>
                  <td>
                    <span
                      className={`badge ${w.status === WorkerStatus.ACTIVE ? 'badge-active' : 'badge-inactive'}`}
                    >
                      {statusLabel[w.status]}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => openEdit(w)}>
                      수정
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(w)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? '근로자 정보 수정' : '근로자 추가'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label className="required">이름</label>
                <input
                  className="text-input"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="required">생년월일</label>
                <input
                  className="text-input"
                  type="date"
                  required
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>성별</label>
                <select
                  className="select-input"
                  value={form.gender ?? ''}
                  onChange={(e) => setForm({ ...form, gender: (e.target.value || undefined) as Gender | undefined })}
                >
                  <option value="">선택 안함</option>
                  <option value={Gender.MALE}>남</option>
                  <option value={Gender.FEMALE}>여</option>
                </select>
              </div>
              <div className="field">
                <label>소속기업</label>
                <select
                  className="select-input"
                  value={form.companyId ?? ''}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value || undefined })}
                >
                  <option value="">미배정</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
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
                <label>이메일 (메일 발송 시 사용)</label>
                <input
                  className="text-input"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                <label>직급</label>
                <input
                  className="text-input"
                  value={form.position ?? ''}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                />
              </div>
              <div className="field">
                <label>계약형태</label>
                <select
                  className="select-input"
                  value={form.contractType ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, contractType: (e.target.value || undefined) as ContractType | undefined })
                  }
                >
                  <option value="">선택 안함</option>
                  <option value={ContractType.FULL_TIME}>정규직</option>
                  <option value={ContractType.PART_TIME}>단시간</option>
                  <option value={ContractType.DAILY}>일용직</option>
                </select>
              </div>
              <div className="field">
                <label>입사일</label>
                <input
                  className="text-input"
                  type="date"
                  value={form.hireDate ?? ''}
                  onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>퇴사일</label>
                <input
                  className="text-input"
                  type="date"
                  value={form.resignDate ?? ''}
                  onChange={(e) => setForm({ ...form, resignDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>급여</label>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  value={form.salary ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, salary: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label>상태</label>
                <select
                  className="select-input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as WorkerStatus })}
                >
                  <option value={WorkerStatus.ACTIVE}>재직</option>
                  <option value={WorkerStatus.ON_LEAVE}>휴직</option>
                  <option value={WorkerStatus.RESIGNED}>퇴사</option>
                </select>
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
