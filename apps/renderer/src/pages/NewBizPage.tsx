import { useEffect, useMemo, useState } from 'react';
import type { JobAnnouncement } from '@job-program/shared';
import { announcementsApi, type AnnouncementInput } from '../api/announcements';
import { Modal } from '../components/Modal';

const emptyForm: AnnouncementInput = { title: '', agency: '', sourceUrl: '', publishedDate: '', category: '', memo: '' };

export function NewBizPage() {
  const [announcements, setAnnouncements] = useState<JobAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnnouncements(await announcementsApi.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : '공고 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await announcementsApi.create(form);
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleChecked = async (a: JobAnnouncement) => {
    try {
      await announcementsApi.update(a.id, { isChecked: !a.isChecked });
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (a: JobAnnouncement) => {
    if (!window.confirm(`'${a.title}' 공고를 삭제하시겠습니까?`)) return;
    try {
      await announcementsApi.remove(a.id);
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

  const uncheckedCount = announcements.filter((a) => !a.isChecked).length;

  const sortedAnnouncements = useMemo(() => {
    const withDate = announcements.filter((a) => a.publishedDate);
    const withoutDate = announcements.filter((a) => !a.publishedDate);
    withDate.sort((a, b) => {
      const cmp = (a.publishedDate ?? '').localeCompare(b.publishedDate ?? '');
      return dateSortOrder === 'asc' ? cmp : -cmp;
    });
    return [...withDate, ...withoutDate];
  }, [announcements, dateSortOrder]);

  return (
    <div className="page">
      <p className="hint-text">
        대구고용노동청 공지사항 게시판에서 제목에 '위탁'이 포함된 공고를 자동으로 수집할 수 있습니다. 그 외 출처
        자동 연동은 준비 중이며, 공고를 직접 등록해 목록으로 관리할 수도 있습니다.
      </p>

      <div className="toolbar">
        <div className="toolbar-left">
          <span className="hint-text">미확인 공고 {uncheckedCount}건</span>
        </div>
        <div className="toolbar-right" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn"
            onClick={() => setDateSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            title="공고일 기준 정렬 방향을 바꿉니다."
          >
            공고일 {dateSortOrder === 'desc' ? '내림차순 ▼' : '오름차순 ▲'}
          </button>
          <button className="btn" onClick={handleCollect} disabled={collecting}>
            {collecting ? '수집 중...' : '대구청 위탁공고 수집'}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + 공고 추가
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>제목</th>
              <th>주관기관</th>
              <th>분류</th>
              <th>공고일</th>
              <th>링크</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={7}>불러오는 중...</td>
              </tr>
            )}
            {!loading && sortedAnnouncements.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}>등록된 공고가 없습니다.</td>
              </tr>
            )}
            {!loading &&
              sortedAnnouncements.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input type="checkbox" checked={a.isChecked} onChange={() => toggleChecked(a)} title="확인함" />
                  </td>
                  <td>{a.title}</td>
                  <td>{a.agency || '-'}</td>
                  <td>{a.category || '-'}</td>
                  <td>{a.publishedDate || '-'}</td>
                  <td>
                    {a.sourceUrl ? (
                      <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                        열기
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="공고 추가" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">제목</label>
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
                <label>주관기관</label>
                <input
                  className="text-input"
                  value={form.agency ?? ''}
                  onChange={(e) => setForm({ ...form, agency: e.target.value })}
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
                <label>링크(URL)</label>
                <input
                  className="text-input"
                  value={form.sourceUrl ?? ''}
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
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
