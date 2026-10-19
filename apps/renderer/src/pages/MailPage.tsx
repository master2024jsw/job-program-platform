import { useEffect, useMemo, useState } from 'react';
import { COMPANY_STAGES, COMPANY_STAGE_LABEL, CompanyStage, MailLogStatus, type CompanyRow, type MailAttachmentMeta, type MailLog, type MailTemplate, type Worker } from '@job-program/shared';
import { mailApi, mailTemplatesApi, type CollectSummary, type MailTemplateInput } from '../api/mail';
import { companiesApi } from '../api/companies';
import { workersApi } from '../api/workers';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';

type SubTab = 'collect' | 'send' | 'templates' | 'logs';

function extractVariables(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

const emptyTemplateForm: MailTemplateInput = { name: '', subject: '', body: '' };

export function MailPage() {
  const { currentBusinessId } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>('collect');
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [logs, setLogs] = useState<MailLog[]>([]);

  useEffect(() => {
    companiesApi.list().then(setCompanies).catch(() => undefined);
    workersApi.list({ businessId: currentBusinessId ?? undefined }).then(setWorkers).catch(() => undefined);
    mailTemplatesApi.list().then(setTemplates).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  const refreshLogs = () => {
    mailApi.logs(currentBusinessId ?? undefined).then(setLogs).catch(() => undefined);
  };

  useEffect(() => {
    if (subTab === 'logs') refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, currentBusinessId]);

  return (
    <div className="page">
      <div className="sub-tab-nav">
        <button className={`btn btn-sm ${subTab === 'collect' ? 'btn-primary' : ''}`} onClick={() => setSubTab('collect')}>
          메일 수집
        </button>
        <button className={`btn btn-sm ${subTab === 'send' ? 'btn-primary' : ''}`} onClick={() => setSubTab('send')}>
          메일 발송
        </button>
        <button
          className={`btn btn-sm ${subTab === 'templates' ? 'btn-primary' : ''}`}
          onClick={() => setSubTab('templates')}
        >
          템플릿 관리
        </button>
        <button className={`btn btn-sm ${subTab === 'logs' ? 'btn-primary' : ''}`} onClick={() => setSubTab('logs')}>
          발송 이력
        </button>
      </div>

      {subTab === 'collect' && <CollectPanel />}
      {subTab === 'send' && (
        <SendMailPanel companies={companies} workers={workers} templates={templates} businessId={currentBusinessId} />
      )}
      {subTab === 'templates' && <TemplatesPanel templates={templates} onChange={setTemplates} />}
      {subTab === 'logs' && <LogsPanel logs={logs} onRefresh={refreshLogs} />}
    </div>
  );
}

function CollectPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [since, setSince] = useState(today);
  const [before, setBefore] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [result, setResult] = useState<CollectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCollect = async () => {
    setCollecting(true);
    setResult(null);
    setError(null);
    try {
      const summary = await mailApi.collect({
        since: since || undefined,
        before: before || undefined,
      });
      setResult(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : '메일 수집에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.25rem', maxWidth: 560 }}>
      <p className="hint-text" style={{ marginBottom: '1rem' }}>
        받은편지함의 안 읽은 메일에서 첨부파일을 수집합니다.
        참여기업신청서가 첨부된 경우 AI가 기업 정보를 분석하여 자동으로 등록합니다.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'flex-end' }}>
        <div className="field">
          <label>수집 시작일</label>
          <input
            type="date"
            className="text-input"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </div>
        <div className="field">
          <label>수집 종료일 <span className="hint-text">(선택)</span></label>
          <input
            type="date"
            className="text-input"
            value={before}
            min={since || undefined}
            onChange={(e) => setBefore(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={handleCollect} disabled={collecting} style={{ marginBottom: '0' }}>
          {collecting ? '수집 중...' : '메일 수집 실행'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <div>
          <table className="data-table">
            <tbody>
              <tr>
                <td>처리된 메일</td>
                <td><strong>{result.messagesProcessed}건</strong></td>
              </tr>
              <tr>
                <td>저장된 첨부파일</td>
                <td><strong>{result.attachmentsSaved}건</strong></td>
              </tr>
            </tbody>
          </table>
          {result.errors.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <p className="hint-text">처리 중 오류:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="error-text">{e}</p>
              ))}
            </div>
          )}
          {result.messagesProcessed === 0 && (
            <p className="hint-text" style={{ marginTop: '0.75rem' }}>수집할 새 메일이 없습니다.</p>
          )}
          {result.attachmentsSaved > 0 && (
            <p className="hint-text" style={{ marginTop: '0.75rem', color: 'var(--color-success)' }}>
              문서함에서 수집된 파일과 AI 분석 결과를 확인하세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_FILTERS: { label: string; value: CompanyStage | 'all' }[] = [
  { label: '전체', value: 'all' },
  ...COMPANY_STAGES.map((st) => ({ label: COMPANY_STAGE_LABEL[st], value: st })),
];

function SendMailPanel({
  companies,
  workers,
  templates,
  businessId,
}: {
  companies: CompanyRow[];
  workers: Worker[];
  templates: MailTemplate[];
  businessId: string | null;
}) {
  const [mode, setMode] = useState<'company' | 'worker' | 'manual'>('company');

  // 기업 일괄 발송 상태
  const [stageFilter, setStageFilter] = useState<CompanyStage | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 근로자 / 직접입력 단건 발송 상태
  const [workerId, setWorkerId] = useState('');
  const [manualEmails, setManualEmails] = useState('');

  const [templateId, setTemplateId] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<MailLog[] | null>(null);

  // 단계 + 검색어 필터 후 가나다순 정렬
  const filteredCompanies = useMemo(() => {
    let list = stageFilter === 'all' ? companies : companies.filter((c) => c.stage === stageFilter);
    if (keyword.trim()) list = list.filter((c) => c.name.includes(keyword.trim()));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [companies, stageFilter, keyword]);

  const emailableCount = filteredCompanies.filter((c) => c.email).length;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelectedIds(new Set(filteredCompanies.filter((c) => c.email).map((c) => c.id)));
  const clearAll = () => setSelectedIds(new Set());
  const changeStage = (v: CompanyStage | 'all') => { setStageFilter(v); setSelectedIds(new Set()); };

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const variableKeys = useMemo(() => {
    const src = selectedTemplate ? `${selectedTemplate.subject} ${selectedTemplate.body}` : `${customSubject} ${customBody}`;
    return extractVariables(src);
  }, [selectedTemplate, customSubject, customBody]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) { setSendError('사업을 먼저 선택하세요.'); return; }
    setSending(true); setSendError(null); setResult(null);
    try {
      if (mode === 'company') {
        const targets = filteredCompanies.filter((c) => selectedIds.has(c.id) && c.email);
        if (targets.length === 0) { setSendError('발송할 기업을 선택하세요.'); setSending(false); return; }
        setProgress({ done: 0, total: targets.length });
        const allLogs: MailLog[] = [];
        for (let i = 0; i < targets.length; i++) {
          const logs = await mailApi.send({
            businessId, companyId: targets[i].id,
            templateId: templateId || undefined,
            subject: templateId ? undefined : customSubject,
            body: templateId ? undefined : customBody,
            variables,
          }, attachFiles);
          allLogs.push(...logs);
          setProgress({ done: i + 1, total: targets.length });
        }
        setResult(allLogs);
      } else {
        const logs = await mailApi.send({
          businessId,
          to: mode === 'manual' ? manualEmails.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          workerId: mode === 'worker' ? workerId || undefined : undefined,
          templateId: templateId || undefined,
          subject: templateId ? undefined : customSubject,
          body: templateId ? undefined : customBody,
          variables,
        }, attachFiles);
        setResult(logs);
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '메일 발송에 실패했습니다.');
    } finally {
      setSending(false); setProgress(null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      {/* 왼쪽: 기업 목록 패널 (기업 담당자 모드에서만 표시) */}
      {mode === 'company' && (
        <div className="card" style={{ flex: '0 0 300px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {STAGE_FILTERS.map((f) => (
              <button key={String(f.value)} type="button"
                className={`btn btn-sm${stageFilter === f.value ? ' btn-primary' : ''}`}
                onClick={() => changeStage(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input className="text-input" placeholder="기업명 검색" value={keyword}
            onChange={(e) => setKeyword(e.target.value)} style={{ width: '100%' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <span className="hint-text">{filteredCompanies.length}개 · 이메일 {emailableCount}개</span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn btn-sm" onClick={selectAll}>전체선택</button>
              <button type="button" className="btn btn-sm" onClick={clearAll}>해제</button>
            </div>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filteredCompanies.length === 0 && (
              <p className="hint-text" style={{ padding: '0.5rem 0' }}>기업이 없습니다.</p>
            )}
            {filteredCompanies.map((c) => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.35rem 0.5rem', borderRadius: '4px',
                cursor: c.email ? 'pointer' : 'default',
                opacity: c.email ? 1 : 0.45,
                background: selectedIds.has(c.id) ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
              }}>
                <input type="checkbox" checked={selectedIds.has(c.id)} disabled={!c.email}
                  onChange={() => c.email && toggleSelect(c.id)} />
                <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{c.name}</span>
                {!c.email && <span className="hint-text" style={{ fontSize: '0.75rem' }}>이메일없음</span>}
              </label>
            ))}
          </div>
          {selectedIds.size > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>
              {selectedIds.size}개 선택됨
            </p>
          )}
        </div>
      )}

      {/* 오른쪽: 발송 설정 패널 */}
      <div className="card" style={{ flex: 1, padding: '1.25rem' }}>
        <form onSubmit={handleSend}>
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>수신자 유형</label>
            <div className="radio-group">
              <label><input type="radio" checked={mode === 'company'} onChange={() => setMode('company')} /> 기업 담당자 (일괄)</label>
              <label><input type="radio" checked={mode === 'worker'} onChange={() => setMode('worker')} /> 근로자</label>
              <label><input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} /> 직접 입력</label>
            </div>
          </div>

          {mode === 'worker' && (
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <label>근로자 선택</label>
              <select className="select-input" value={workerId} onChange={(e) => setWorkerId(e.target.value)} required>
                <option value="">선택하세요</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id} disabled={!w.email}>{w.name}{w.email ? '' : ' (이메일 없음)'}</option>
                ))}
              </select>
            </div>
          )}

          {mode === 'manual' && (
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <label>수신 이메일 (콤마로 구분)</label>
              <input className="text-input" style={{ width: '100%' }} placeholder="a@example.com, b@example.com"
                value={manualEmails} onChange={(e) => setManualEmails(e.target.value)} required />
            </div>
          )}

          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>메일 템플릿</label>
            <select className="select-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">직접 작성</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {!templateId && (
            <>
              <div className="field full" style={{ marginBottom: '1rem' }}>
                <label className="required">제목</label>
                <input className="text-input" style={{ width: '100%' }} required
                  value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
              </div>
              <div className="field full" style={{ marginBottom: '1rem' }}>
                <label className="required">{'본문 (HTML 가능, {{변수명}} 사용 가능)'}</label>
                <textarea className="textarea-input" style={{ width: '100%' }} rows={5} required
                  value={customBody} onChange={(e) => setCustomBody(e.target.value)} />
              </div>
            </>
          )}

          {templateId && selectedTemplate && (
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <label>미리보기</label>
              <p className="hint-text">제목: {selectedTemplate.subject}</p>
              <div className="card" style={{ padding: '0.75rem', fontSize: '0.85rem' }}
                dangerouslySetInnerHTML={{ __html: selectedTemplate.body }} />
              {selectedTemplate.attachments && selectedTemplate.attachments.length > 0 && (
                <p className="hint-text" style={{ marginTop: '0.5rem' }}>
                  📎 템플릿 기본 첨부: {selectedTemplate.attachments.map((a) => a.fileName).join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>첨부파일 {selectedTemplate?.attachments?.length ? '(템플릿 첨부에 추가)' : ''}</label>
            <input type="file" multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setAttachFiles((prev) => [...prev, ...files]);
                e.target.value = '';
              }} />
            {attachFiles.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {attachFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                    <span style={{ flex: 1 }}>📎 {f.name} <span className="hint-text">({Math.round(f.size / 1024)}KB)</span></span>
                    <button type="button" className="btn btn-sm btn-danger"
                      onClick={() => setAttachFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      제거
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {variableKeys.length > 0 && (
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <label>변수 값 입력</label>
              {variableKeys.map((key) => (
                <div className="variable-row" key={key}>
                  <span className="var-key">{`{{${key}}}`}</span>
                  <input className="text-input" value={variables[key] ?? ''}
                    onChange={(e) => setVariables({ ...variables, [key]: e.target.value })} />
                </div>
              ))}
            </div>
          )}

          {sendError && <p className="error-text">{sendError}</p>}
          {progress && <p className="hint-text">{progress.done} / {progress.total}건 발송 중...</p>}

          {result && (
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <p className="hint-text">
                발송 완료: 성공 {result.filter((r) => r.status === MailLogStatus.SUCCESS).length}건 / 실패{' '}
                {result.filter((r) => r.status === MailLogStatus.FAILED).length}건
              </p>
              {result.filter((r) => r.status === MailLogStatus.FAILED).map((r) => (
                <p key={r.id} className="error-text">{r.to}: {r.errorMessage}</p>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary"
              disabled={sending || (mode === 'company' && selectedIds.size === 0)}>
              {sending
                ? '발송 중...'
                : mode === 'company' && selectedIds.size > 0
                  ? `${selectedIds.size}개 기업에 발송`
                  : '메일 발송'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TemplatesPanel({
  templates,
  onChange,
}: {
  templates: MailTemplate[];
  onChange: (templates: MailTemplate[]) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MailTemplate | null>(null);
  const [form, setForm] = useState<MailTemplateInput>(emptyTemplateForm);
  const [attachments, setAttachments] = useState<MailAttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    onChange(await mailTemplatesApi.list());
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyTemplateForm);
    setAttachments([]);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (t: MailTemplate) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setAttachments(t.attachments ?? []);
    setFormError(null);
    setModalOpen(true);
  };

  const handleUploadAttachments = async (files: File[]) => {
    if (!editing || files.length === 0) return;
    setUploading(true);
    setFormError(null);
    try {
      const saved = await mailTemplatesApi.addAttachments(editing.id, files);
      setAttachments((prev) => [...prev, ...saved]);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '첨부 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!editing) return;
    try {
      await mailTemplatesApi.removeAttachment(editing.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '첨부 삭제에 실패했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await mailTemplatesApi.update(editing.id, form);
      } else {
        await mailTemplatesApi.create(form);
      }
      setModalOpen(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: MailTemplate) => {
    if (!window.confirm(`'${t.name}' 템플릿을 삭제하시겠습니까?`)) return;
    try {
      await mailTemplatesApi.remove(t.id);
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="hint-text">본문에 {'{{이름}}'} 형태의 변수를 사용할 수 있습니다.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + 템플릿 추가
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>템플릿명</th>
              <th>제목</th>
              <th>첨부</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr className="empty-row">
                <td colSpan={4}>등록된 템플릿이 없습니다.</td>
              </tr>
            )}
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.subject}</td>
                <td>{t.attachments?.length ? `📎 ${t.attachments.length}` : '-'}</td>
                <td className="actions">
                  <button className="btn btn-sm" onClick={() => openEdit(t)}>
                    수정
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? '템플릿 수정' : '템플릿 추가'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">템플릿명</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">제목</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                required
                maxLength={200}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">본문 (HTML 가능)</label>
              <textarea
                className="textarea-input"
                style={{ width: '100%' }}
                rows={8}
                required
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>

            <div className="field full">
              <label>기본 첨부파일</label>
              {editing ? (
                <>
                  <input type="file" multiple disabled={uploading}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      handleUploadAttachments(files);
                      e.target.value = '';
                    }} />
                  {uploading && <p className="hint-text">업로드 중...</p>}
                  {attachments.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {attachments.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                          <span style={{ flex: 1 }}>📎 {a.fileName} <span className="hint-text">({Math.round(a.fileSize / 1024)}KB)</span></span>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleRemoveAttachment(a.id)}>
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="hint-text" style={{ marginTop: '0.35rem' }}>
                    이 템플릿으로 보내는 모든 메일에 자동 첨부됩니다.
                  </p>
                </>
              ) : (
                <p className="hint-text">템플릿을 먼저 저장한 뒤, 다시 수정으로 들어오면 첨부파일을 추가할 수 있습니다.</p>
              )}
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

function LogsPanel({ logs, onRefresh }: { logs: MailLog[]; onRefresh: () => void }) {
  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="hint-text">최근 200건까지 표시됩니다.</p>
        </div>
        <button className="btn" onClick={onRefresh}>
          새로고침
        </button>
      </div>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>수신자</th>
              <th>제목</th>
              <th>상태</th>
              <th>오류</th>
              <th>발송시각</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr className="empty-row">
                <td colSpan={5}>발송 이력이 없습니다.</td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.to}</td>
                <td>{log.subject}</td>
                <td>
                  <span className={`badge ${log.status === MailLogStatus.SUCCESS ? 'badge-active' : 'badge-failed'}`}>
                    {log.status === MailLogStatus.SUCCESS ? '성공' : '실패'}
                  </span>
                </td>
                <td>{log.errorMessage || '-'}</td>
                <td>{new Date(log.createdAt).toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
