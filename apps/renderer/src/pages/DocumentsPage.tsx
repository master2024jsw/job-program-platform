import { useEffect, useMemo, useRef, useState } from 'react';
import { DocumentAnalysisStatus, type Company, type Document, type MailTemplate, type Worker } from '@job-program/shared';
import { documentsApi } from '../api/documents';
import { companiesApi } from '../api/companies';
import { workersApi } from '../api/workers';
import { mailApi, mailTemplatesApi } from '../api/mail';
import { Modal } from '../components/Modal';

const STATUS_LABEL: Record<DocumentAnalysisStatus, string> = {
  [DocumentAnalysisStatus.PENDING]: '대기',
  [DocumentAnalysisStatus.ANALYZING]: '분석중',
  [DocumentAnalysisStatus.ANALYZED]: '분석완료',
  [DocumentAnalysisStatus.FAILED]: '실패',
  [DocumentAnalysisStatus.REVIEWED]: '검토완료',
};

function statusBadgeClass(status: DocumentAnalysisStatus): string {
  if (status === DocumentAnalysisStatus.FAILED) return 'badge-failed';
  if (status === DocumentAnalysisStatus.ANALYZED || status === DocumentAnalysisStatus.REVIEWED) return 'badge-active';
  return 'badge-inactive';
}

function getMissingItems(doc: Document): string[] {
  const data = (doc.reviewedData ?? doc.extractedData) as Record<string, unknown> | null;
  const items = data?.missingItems;
  return Array.isArray(items) ? items.map(String) : [];
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const workerMap = useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await documentsApi.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    companiesApi.list().then(setCompanies).catch(() => undefined);
    workersApi.list().then(setWorkers).catch(() => undefined);
  }, []);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const summary = await documentsApi.collectAttachments();
      window.alert(
        `메일 ${summary.messagesProcessed}건 확인, 첨부파일 ${summary.attachmentsSaved}건 저장됨` +
          (summary.errors.length ? `\n오류 ${summary.errors.length}건:\n${summary.errors.join('\n')}` : ''),
      );
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '첨부파일 수집에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };

  const handleUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await documentsApi.upload(file, {});
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (doc: Document) => {
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: DocumentAnalysisStatus.ANALYZING } : d)));
    try {
      const updated = await documentsApi.analyze(doc.id);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      if (reviewing?.id === doc.id) setReviewing(updated);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '분석 요청에 실패했습니다.');
      await load();
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!window.confirm(`'${doc.fileName}' 문서를 삭제하시겠습니까?`)) return;
    try {
      await documentsApi.remove(doc.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="hint-text">
            메일로 회신된 첨부파일을 자동 수집하거나, PDF/이미지/HWP 문서를 직접 업로드해 AI로 분석할 수 있습니다.
          </p>
        </div>
        <div className="toolbar-left">
          <button className="btn" onClick={() => documentsApi.exportReport()}>
            AI 검토 보고서 다운로드
          </button>
          <button className="btn" disabled={collecting} onClick={handleCollect}>
            {collecting ? '수집 중...' : '첨부파일 수집'}
          </button>
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? '업로드 중...' : '+ 문서 업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.hwp,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={handleUploadFileChange}
          />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>파일명</th>
              <th>문서종류</th>
              <th>출처</th>
              <th>연결된 기업/근로자</th>
              <th>상태</th>
              <th>미비여부</th>
              <th>등록일시</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={8}>불러오는 중...</td>
              </tr>
            )}
            {!loading && documents.length === 0 && (
              <tr className="empty-row">
                <td colSpan={8}>등록된 문서가 없습니다.</td>
              </tr>
            )}
            {!loading &&
              documents.map((doc) => {
                const missingItems = getMissingItems(doc);
                return (
                <tr key={doc.id}>
                  <td>{doc.fileName}</td>
                  <td>{doc.documentType || '-'}</td>
                  <td>{doc.source === 'IMAP' ? `메일 수집${doc.senderEmail ? ` (${doc.senderEmail})` : ''}` : '직접 업로드'}</td>
                  <td>
                    {doc.companyId ? companyMap.get(doc.companyId) ?? '-' : ''}
                    {doc.workerId ? ` / ${workerMap.get(doc.workerId) ?? '-'}` : ''}
                    {!doc.companyId && !doc.workerId && '-'}
                  </td>
                  <td>
                    <span className={`badge ${statusBadgeClass(doc.status)}`}>{STATUS_LABEL[doc.status]}</span>
                  </td>
                  <td>
                    {missingItems.length > 0 ? (
                      <span className="badge badge-failed">미비 {missingItems.length}건</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{new Date(doc.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="actions">
                    {doc.status === DocumentAnalysisStatus.PENDING ? (
                      <button className="btn btn-sm" onClick={() => handleAnalyze(doc)}>
                        분석 실행
                      </button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => setReviewing(doc)}>
                        검토
                      </button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(doc)}>
                      삭제
                    </button>
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {reviewing && (
        <DocumentReviewModal
          document={reviewing}
          companies={companies}
          workers={workers}
          onClose={() => setReviewing(null)}
          onAnalyze={() => handleAnalyze(reviewing)}
          onSaved={(updated) => {
            setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setReviewing(null);
          }}
        />
      )}
    </div>
  );
}

function DocumentReviewModal({
  document,
  companies,
  workers,
  onClose,
  onAnalyze,
  onSaved,
}: {
  document: Document;
  companies: Company[];
  workers: Worker[];
  onClose: () => void;
  onAnalyze: () => void;
  onSaved: (updated: Document) => void;
}) {
  const initialData = document.reviewedData ?? document.extractedData ?? {};
  const [jsonText, setJsonText] = useState(JSON.stringify(initialData, null, 2));
  const [companyId, setCompanyId] = useState(document.companyId ?? '');
  const [workerId, setWorkerId] = useState(document.workerId ?? '');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const missingItems = getMissingItems(document);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [notifyTemplateId, setNotifyTemplateId] = useState('');
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    mailTemplatesApi.list().then(setTemplates).catch(() => undefined);
  }, []);

  const handleNotifyMissingItems = async () => {
    if (!notifyTemplateId) {
      window.alert('안내 메일 템플릿을 선택하세요.');
      return;
    }
    if (!companyId && !workerId) {
      window.alert('소속기업 또는 관련 근로자를 먼저 연결하세요.');
      return;
    }
    setNotifying(true);
    try {
      const logs = await mailApi.send({
        companyId: workerId ? undefined : companyId || undefined,
        workerId: workerId || undefined,
        templateId: notifyTemplateId,
        variables: {
          fileName: document.fileName,
          documentType: document.documentType ?? '',
          missingItems: missingItems.join(', '),
        },
      });
      const failedLog = logs.find((log) => log.status !== 'SUCCESS');
      if (failedLog) {
        window.alert(`발송 실패: ${failedLog.errorMessage ?? '알 수 없는 오류'}`);
      } else {
        window.alert('미비사항 안내 메일을 발송했습니다.');
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '메일 발송에 실패했습니다.');
    } finally {
      setNotifying(false);
    }
  };

  const handleSave = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError('JSON 형식이 올바르지 않습니다.');
      return;
    }
    setJsonError(null);
    setSaving(true);
    try {
      const updated = await documentsApi.update(document.id, {
        reviewedData: parsed,
        status: 'REVIEWED',
        companyId: companyId || undefined,
        workerId: workerId || undefined,
      });
      onSaved(updated);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`문서 검토 - ${document.fileName}`} onClose={onClose}>
      {document.status === DocumentAnalysisStatus.FAILED && (
        <p className="error-text">분석 실패: {document.errorMessage}</p>
      )}

      {missingItems.length > 0 && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '0.85rem', borderColor: 'var(--danger)' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>미비 항목 {missingItems.length}건</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
            {missingItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
          <div className="toolbar" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <div className="toolbar-left">
              <select
                className="select-input"
                value={notifyTemplateId}
                onChange={(e) => setNotifyTemplateId(e.target.value)}
              >
                <option value="">안내 메일 템플릿 선택</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-sm" disabled={notifying} onClick={handleNotifyMissingItems}>
              {notifying ? '발송 중...' : '미비사항 안내 메일 발송'}
            </button>
          </div>
          <p className="hint-text" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            사용 가능 변수: {'{{fileName}}'} {'{{documentType}}'} {'{{missingItems}}'}
          </p>
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: '0.85rem' }}>
        <div className="field">
          <label>소속기업</label>
          <select className="select-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">미연결</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>관련 근로자</label>
          <select className="select-input" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">미연결</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field full" style={{ marginBottom: '0.5rem' }}>
        <label>AI 추출 결과 (JSON, 직접 수정 가능)</label>
        <textarea
          className="textarea-input"
          style={{ width: '100%', fontFamily: 'Consolas, monospace', fontSize: '0.82rem' }}
          rows={14}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
      {jsonError && <p className="error-text">{jsonError}</p>}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onAnalyze}>
          재분석
        </button>
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? '저장 중...' : '검토 완료 저장'}
        </button>
      </div>
    </Modal>
  );
}
