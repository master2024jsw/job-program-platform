import { useEffect, useMemo, useState } from 'react';
import { MailLogStatus, type Company, type MailLog, type MailTemplate, type Worker } from '@job-program/shared';
import { mailApi, mailTemplatesApi, type MailTemplateInput } from '../api/mail';
import { companiesApi } from '../api/companies';
import { workersApi } from '../api/workers';
import { Modal } from '../components/Modal';

type SubTab = 'send' | 'templates' | 'logs';

function extractVariables(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

const emptyTemplateForm: MailTemplateInput = { name: '', subject: '', body: '' };

export function MailPage() {
  const [subTab, setSubTab] = useState<SubTab>('send');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [logs, setLogs] = useState<MailLog[]>([]);

  useEffect(() => {
    companiesApi.list().then(setCompanies).catch(() => undefined);
    workersApi.list().then(setWorkers).catch(() => undefined);
    mailTemplatesApi.list().then(setTemplates).catch(() => undefined);
  }, []);

  const refreshLogs = () => {
    mailApi.logs().then(setLogs).catch(() => undefined);
  };

  useEffect(() => {
    if (subTab === 'logs') refreshLogs();
  }, [subTab]);

  return (
    <div className="page">
      <div className="sub-tab-nav">
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

      {subTab === 'send' && <SendMailPanel companies={companies} workers={workers} templates={templates} />}
      {subTab === 'templates' && <TemplatesPanel templates={templates} onChange={setTemplates} />}
      {subTab === 'logs' && <LogsPanel logs={logs} onRefresh={refreshLogs} />}
    </div>
  );
}

function SendMailPanel({
  companies,
  workers,
  templates,
}: {
  companies: Company[];
  workers: Worker[];
  templates: MailTemplate[];
}) {
  const [mode, setMode] = useState<'manual' | 'company' | 'worker'>('company');
  const [manualEmails, setManualEmails] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<MailLog[] | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const variableKeys = useMemo(() => {
    const source = selectedTemplate ? `${selectedTemplate.subject} ${selectedTemplate.body}` : `${customSubject} ${customBody}`;
    return extractVariables(source);
  }, [selectedTemplate, customSubject, customBody]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendError(null);
    setResult(null);
    try {
      const dto = {
        to: mode === 'manual' ? manualEmails.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        companyId: mode === 'company' ? companyId || undefined : undefined,
        workerId: mode === 'worker' ? workerId || undefined : undefined,
        templateId: templateId || undefined,
        subject: templateId ? undefined : customSubject,
        body: templateId ? undefined : customBody,
        variables,
      };
      const logs = await mailApi.send(dto);
      setResult(logs);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '메일 발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.25rem', maxWidth: 720 }}>
      <form onSubmit={handleSend}>
        <div className="field full" style={{ marginBottom: '1rem' }}>
          <label>수신자</label>
          <div className="radio-group">
            <label>
              <input type="radio" checked={mode === 'company'} onChange={() => setMode('company')} />
              기업 담당자
            </label>
            <label>
              <input type="radio" checked={mode === 'worker'} onChange={() => setMode('worker')} />
              근로자
            </label>
            <label>
              <input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} />
              직접 입력
            </label>
          </div>
        </div>

        {mode === 'company' && (
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>기업 선택 (담당자 이메일로 발송)</label>
            <select className="select-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
              <option value="">선택하세요</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.contactManagerEmail}>
                  {c.name}
                  {c.contactManagerEmail ? '' : ' (담당자 이메일 없음)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'worker' && (
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>근로자 선택</label>
            <select className="select-input" value={workerId} onChange={(e) => setWorkerId(e.target.value)} required>
              <option value="">선택하세요</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id} disabled={!w.email}>
                  {w.name}
                  {w.email ? '' : ' (이메일 없음)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'manual' && (
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>수신 이메일 (콤마로 구분)</label>
            <input
              className="text-input"
              style={{ width: '100%' }}
              placeholder="a@example.com, b@example.com"
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              required
            />
          </div>
        )}

        <div className="field full" style={{ marginBottom: '1rem' }}>
          <label>메일 템플릿</label>
          <select className="select-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">직접 작성</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {!templateId && (
          <>
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <label className="required">제목</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                required={!templateId}
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
              />
            </div>
            <div className="field full" style={{ marginBottom: '1rem' }}>
              <label className="required">본문 (HTML 가능, {'{{변수명}}'} 사용 가능)</label>
              <textarea
                className="textarea-input"
                style={{ width: '100%' }}
                rows={6}
                required={!templateId}
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
              />
            </div>
          </>
        )}

        {templateId && selectedTemplate && (
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>미리보기</label>
            <p className="hint-text">제목: {selectedTemplate.subject}</p>
            <div
              className="card"
              style={{ padding: '0.75rem', fontSize: '0.85rem' }}
              dangerouslySetInnerHTML={{ __html: selectedTemplate.body }}
            />
          </div>
        )}

        {variableKeys.length > 0 && (
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <label>변수 값 입력</label>
            {variableKeys.map((key) => (
              <div className="variable-row" key={key}>
                <span className="var-key">{`{{${key}}}`}</span>
                <input
                  className="text-input"
                  value={variables[key] ?? ''}
                  onChange={(e) => setVariables({ ...variables, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {sendError && <p className="error-text">{sendError}</p>}

        {result && (
          <div className="field full" style={{ marginBottom: '1rem' }}>
            <p className="hint-text">
              발송 완료: 성공 {result.filter((r) => r.status === MailLogStatus.SUCCESS).length}건 / 실패{' '}
              {result.filter((r) => r.status === MailLogStatus.FAILED).length}건
            </p>
            {result
              .filter((r) => r.status === MailLogStatus.FAILED)
              .map((r) => (
                <p key={r.id} className="error-text">
                  {r.to}: {r.errorMessage}
                </p>
              ))}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? '발송 중...' : '메일 발송'}
          </button>
        </div>
      </form>
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
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    onChange(await mailTemplatesApi.list());
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyTemplateForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (t: MailTemplate) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setFormError(null);
    setModalOpen(true);
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
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr className="empty-row">
                <td colSpan={3}>등록된 템플릿이 없습니다.</td>
              </tr>
            )}
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.subject}</td>
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
            <div className="field full">
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
