import { useEffect, useMemo, useState } from 'react';
import { BUSINESS_TYPE_CODES, BUSINESS_TYPE_LABELS, type AnnouncementStatus, type JobAnnouncementRow } from '@job-program/shared';
import { announcementsApi, type AnnouncementInput, type AnnouncementListParams } from '../api/announcements';
import { businessesApi } from '../api/businesses';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';

const emptyForm: AnnouncementInput = {
  title: '',
  agency: '',
  sourceUrl: '',
  publishedDate: '',
  category: '',
  typeCode: '',
  qualification: '',
  applicationStartDate: '',
  deadline: '',
  department: '',
  contact: '',
  memo: '',
};

const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  ONGOING: '진행중',
  DEADLINE_SOON: '마감임박',
  CLOSED: '마감',
  UNSPECIFIED: '마감일 미정',
};

const STATUS_BADGE_CLASS: Record<AnnouncementStatus, string> = {
  ONGOING: 'badge-active',
  DEADLINE_SOON: 'badge-failed',
  CLOSED: 'badge-inactive',
  UNSPECIFIED: 'badge-inactive',
};

export function NewBizPage() {
  const [announcements, setAnnouncements] = useState<JobAnnouncementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | ''>('');
  const [sortBy, setSortBy] = useState<NonNullable<AnnouncementListParams['sortBy']>>('deadline');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [keyword, setKeyword] = useState('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobAnnouncementRow | null>(null);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detailTarget, setDetailTarget] = useState<JobAnnouncementRow | null>(null);
  const [registerTarget, setRegisterTarget] = useState<JobAnnouncementRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnnouncements(
        await announcementsApi.list({
          status: statusFilter || undefined,
          sortBy,
          sortOrder,
          keyword: keyword || undefined,
          bookmarkedOnly,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '공고 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortBy, sortOrder, bookmarkedOnly]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (a: JobAnnouncementRow) => {
    setEditing(a);
    setForm({
      title: a.title,
      agency: a.agency ?? '',
      sourceUrl: a.sourceUrl ?? '',
      publishedDate: a.publishedDate ?? '',
      category: a.category ?? '',
      typeCode: a.typeCode ?? '',
      qualification: a.qualification ?? '',
      applicationStartDate: a.applicationStartDate ?? '',
      deadline: a.deadline ?? '',
      department: a.department ?? '',
      contact: a.contact ?? '',
      memo: a.memo ?? '',
    });
    setFormError(null);
    setFormOpen(true);
    setDetailTarget(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await announcementsApi.update(editing.id, form);
      } else {
        await announcementsApi.create(form);
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleChecked = async (a: JobAnnouncementRow) => {
    try {
      await announcementsApi.update(a.id, { isChecked: !a.isChecked });
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    }
  };

  const toggleBookmark = async (a: JobAnnouncementRow) => {
    try {
      await announcementsApi.update(a.id, { isBookmarked: !a.isBookmarked });
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '북마크 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (a: JobAnnouncementRow) => {
    if (!window.confirm(`'${a.title}' 공고를 삭제하시겠습니까?`)) return;
    try {
      await announcementsApi.remove(a.id);
      setDetailTarget(null);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const handleCollect = async () => {
    setCollecting(true);
    setError(null);
    try {
      const summary = await announcementsApi.collectMoelDaegu();
      await load();
      window.alert(
        `대구고용노동청 '${summary.keyword}' 공고 수집 완료\n조회 ${summary.found}건 · 신규 등록 ${summary.created}건 · 기존 ${summary.skipped}건`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '위탁공고 수집에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const uncheckedCount = useMemo(() => announcements.filter((a) => !a.isChecked).length, [announcements]);

  return (
    <div className="page">
      <p className="hint-text">
        대구고용노동청 공지사항 게시판에서 제목에 '위탁'이 포함된 공고를 자동으로 수집할 수 있습니다. 그 외 출처
        자동 연동(크롤링·AI 계획서 초안)은 준비 중이며, 공고를 직접 등록해 목록으로 관리할 수도 있습니다.
      </p>

      <div className="toolbar">
        <div className="toolbar-left">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="search-input"
              placeholder="사업명 · 발주기관 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button className="btn btn-sm" type="submit">
              검색
            </button>
          </form>
          <select className="select-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AnnouncementStatus | '')}>
            <option value="">전체 상태</option>
            <option value="ONGOING">진행중</option>
            <option value="DEADLINE_SOON">마감임박</option>
            <option value="CLOSED">마감</option>
          </select>
          <select
            className="select-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as NonNullable<AnnouncementListParams['sortBy']>)}
          >
            <option value="deadline">마감일순</option>
            <option value="publishedDate">공고일순</option>
            <option value="agency">발주기관순</option>
            <option value="title">사업명순</option>
          </select>
          <button className="btn btn-sm" onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}>
            {sortOrder === 'asc' ? '오름차순 ▲' : '내림차순 ▼'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={bookmarkedOnly} onChange={(e) => setBookmarkedOnly(e.target.checked)} />
            관심 공고만
          </label>
          <span className="hint-text">미확인 {uncheckedCount}건</span>
        </div>
        <div className="toolbar-left">
          <button className="btn" disabled title="준비 중인 기능입니다. TODO(다음지시서): 공고 크롤링">
            공고 수집/새로고침 (준비중)
          </button>
          <button className="btn" onClick={handleCollect} disabled={collecting}>
            {collecting ? '수집 중...' : '대구청 위탁공고 수집'}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + 공고 수동 추가
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th></th>
              <th>사업명</th>
              <th>발주기관</th>
              <th>유형</th>
              <th>마감일</th>
              <th>D-day</th>
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
            {!loading && announcements.length === 0 && (
              <tr className="empty-row">
                <td colSpan={9}>등록된 공고가 없습니다.</td>
              </tr>
            )}
            {!loading &&
              announcements.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="icon-btn"
                      title={a.isBookmarked ? '관심 공고 해제' : '관심 공고로 저장'}
                      onClick={() => toggleBookmark(a)}
                      style={{ color: a.isBookmarked ? '#f59e0b' : undefined }}
                    >
                      {a.isBookmarked ? '★' : '☆'}
                    </button>
                  </td>
                  <td>
                    <input type="checkbox" checked={a.isChecked} onChange={() => toggleChecked(a)} title="확인함" />
                  </td>
                  <td>
                    <a href="#" onClick={(e) => { e.preventDefault(); setDetailTarget(a); }}>
                      {a.title}
                    </a>
                  </td>
                  <td>{a.agency || '-'}</td>
                  <td>{a.typeCode || a.category || '-'}</td>
                  <td>{a.deadline || '-'}</td>
                  <td>
                    {a.daysUntilDeadline === null
                      ? '-'
                      : a.daysUntilDeadline >= 0
                        ? `D-${a.daysUntilDeadline}`
                        : `D+${-a.daysUntilDeadline}`}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE_CLASS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => setDetailTarget(a)}>
                      상세
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(a)}>
                      편집
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>사업계획서 초안 (준비중)</h3>
        <p className="hint-text" style={{ marginBottom: '0.85rem' }}>
          아래 기능은 다음 지시서에서 구현될 예정입니다.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn" disabled title="TODO(다음지시서): 계획서 초안 생성(AI)">
            계획서 초안 생성 (AI)
          </button>
          <button className="btn" disabled title="TODO(다음지시서): 지난 계획서 불러오기">
            지난 계획서 불러오기
          </button>
          <button className="btn" disabled title="TODO(다음지시서): 초안 검사">
            초안 검사
          </button>
          <button className="btn" disabled title="TODO(다음지시서): AI 참고자료 추천">
            AI 참고자료 추천
          </button>
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? '공고 편집' : '공고 수동 추가'} onClose={() => setFormOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">사업명</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                required
                maxLength={300}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>발주기관</label>
                <input
                  className="text-input"
                  value={form.agency ?? ''}
                  onChange={(e) => setForm({ ...form, agency: e.target.value })}
                />
              </div>
              <div className="field">
                <label>사업유형코드</label>
                <input
                  className="text-input"
                  placeholder="예: SENIOR, YOUTH"
                  value={form.typeCode ?? ''}
                  onChange={(e) => setForm({ ...form, typeCode: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="field">
                <label>분류</label>
                <input
                  className="text-input"
                  placeholder="예: 청년, 시니어"
                  value={form.category ?? ''}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="field">
                <label>공고일</label>
                <input
                  className="text-input"
                  type="date"
                  value={form.publishedDate ?? ''}
                  onChange={(e) => setForm({ ...form, publishedDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>신청시작일</label>
                <input
                  className="text-input"
                  type="date"
                  value={form.applicationStartDate ?? ''}
                  onChange={(e) => setForm({ ...form, applicationStartDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>마감일</label>
                <input
                  className="text-input"
                  type="date"
                  value={form.deadline ?? ''}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                />
              </div>
              <div className="field">
                <label>담당부서</label>
                <input
                  className="text-input"
                  value={form.department ?? ''}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div className="field">
                <label>담당부서 연락처</label>
                <input
                  className="text-input"
                  value={form.contact ?? ''}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>링크(URL)</label>
                <input
                  className="text-input"
                  value={form.sourceUrl ?? ''}
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>자격요건</label>
                <textarea
                  className="textarea-input"
                  rows={2}
                  value={form.qualification ?? ''}
                  onChange={(e) => setForm({ ...form, qualification: e.target.value })}
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

            {formError && <p className="error-text">{formError}</p>}

            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detailTarget && (
        <Modal title="공고 상세" onClose={() => setDetailTarget(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
            <div>
              <strong>{detailTarget.title}</strong>
            </div>
            <div className="hint-text">
              <span className={`badge ${STATUS_BADGE_CLASS[detailTarget.status]}`}>
                {STATUS_LABEL[detailTarget.status]}
              </span>{' '}
              {detailTarget.deadline && `· 마감일 ${detailTarget.deadline}`}
            </div>
            <div>발주기관: {detailTarget.agency || '-'}</div>
            <div>사업유형코드: {detailTarget.typeCode || '-'}</div>
            <div>분류: {detailTarget.category || '-'}</div>
            <div>신청시작일: {detailTarget.applicationStartDate || '-'}</div>
            <div>담당부서: {detailTarget.department || '-'}</div>
            <div>담당부서 연락처: {detailTarget.contact || '-'}</div>
            <div>
              링크:{' '}
              {detailTarget.sourceUrl ? (
                <a href={detailTarget.sourceUrl} target="_blank" rel="noreferrer">
                  {detailTarget.sourceUrl}
                </a>
              ) : (
                '-'
              )}
            </div>
            <div>자격요건: {detailTarget.qualification || '-'}</div>
            <div>메모: {detailTarget.memo || '-'}</div>
            <div className="hint-text">출처: {detailTarget.source === 'crawl' ? '자동수집' : '수동등록'}</div>

            <div className="form-actions">
              <button className="btn" onClick={() => openEdit(detailTarget)}>
                편집
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setRegisterTarget(detailTarget);
                  setDetailTarget(null);
                }}
              >
                이 사업으로 등록
              </button>
            </div>
          </div>
        </Modal>
      )}

      {registerTarget && (
        <RegisterBusinessModal announcement={registerTarget} onClose={() => setRegisterTarget(null)} />
      )}
    </div>
  );
}

function RegisterBusinessModal({
  announcement,
  onClose,
}: {
  announcement: JobAnnouncementRow;
  onClose: () => void;
}) {
  const { refreshBusinesses, setCurrentBusinessId } = useAuth();
  const defaultTypeCode = BUSINESS_TYPE_CODES.includes(announcement.typeCode as (typeof BUSINESS_TYPE_CODES)[number])
    ? (announcement.typeCode as string)
    : BUSINESS_TYPE_CODES[0];

  const [name, setName] = useState(announcement.title);
  const [typeCode, setTypeCode] = useState(defaultTypeCode);
  const [baseYear, setBaseYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const business = await businessesApi.create({ name, typeCode, baseYear: Number(baseYear) });
      await refreshBusinesses();
      setCurrentBusinessId(business.id);
      window.alert(`'${business.name}' 사업이 등록되고 현재 사업으로 선택되었습니다.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '사업 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="이 공고를 사업으로 등록" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field full" style={{ marginBottom: '0.85rem' }}>
          <label className="required">사업명</label>
          <input className="text-input" style={{ width: '100%' }} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="required">사업유형코드</label>
            <select className="select-input" value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
              {BUSINESS_TYPE_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} ({BUSINESS_TYPE_LABELS[code]})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="required">기준연도</label>
            <input
              className="text-input"
              type="number"
              value={baseYear}
              onChange={(e) => setBaseYear(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '등록 중...' : '사업 등록'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
