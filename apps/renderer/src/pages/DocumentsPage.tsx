import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DocumentAnalysisStatus,
  type Company,
  type Document,
  type DocumentTypeCode,
  type DocumentTypeDef,
  type MailTemplate,
  type RequiredDocumentStage,
  type Worker,
} from '@job-program/shared';
import { documentsApi } from '../api/documents';
import { downloadFile } from '../api/client';
import { companiesApi } from '../api/companies';
import { workersApi } from '../api/workers';
import { mailApi, mailTemplatesApi } from '../api/mail';
import { requiredDocumentsApi } from '../api/required-documents';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { RequiredDocumentsChecklist } from '../components/RequiredDocumentsChecklist';
import { CompanyValidationPanel } from '../components/CompanyValidationPanel';

type DocGroup = 'ALL' | 'COMPANY' | 'WORKER' | 'SUBSIDY' | 'NONE';

const DOC_GROUP_LABEL: Record<DocGroup, string> = {
  ALL: '전체',
  COMPANY: '기업 서류',
  WORKER: '근로자 서류',
  SUBSIDY: '지원금 서류',
  NONE: '미지정',
};

type ViewMode = 'current' | 'unassigned' | 'checklist' | 'validation';

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

/**
 * 이 서류에서 실제로 쓸 값을 고른다.
 *
 * 검토값(reviewedData)이 정답이지만, **빈 검토값은 추출값을 가리지 않는다.**
 * 추출이 비어 있을 때 「검토완료」를 누르면 빈 검토값이 저장되는데, 그 뒤 추출을 고쳐 재분석해도
 * 빈 검토값이 남아 화면·검증이 계속 빈 값을 보게 된다(2026-10-16·10-19 실제로 겪음).
 * 서버의 document-data.util.ts 와 같은 규칙이다 — 한쪽만 고치면 화면과 검증이 어긋난다.
 */
function effectiveDocumentData(doc: {
  reviewedData?: unknown;
  extractedData?: unknown;
}): Record<string, unknown> | null {
  const isEmpty = (v: unknown): boolean => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
    const r = v as Record<string, unknown>;
    return !Object.keys(r).some((k) => {
      if (k === 'documentType' || k === 'missingItems') return false;
      const val = r[k];
      if (val == null) return false;
      if (typeof val === 'string') return val.trim() !== '';
      if (Array.isArray(val)) return val.length > 0;
      return true;
    });
  };
  if (!isEmpty(doc.reviewedData)) return doc.reviewedData as Record<string, unknown>;
  if (doc.extractedData && typeof doc.extractedData === 'object' && !Array.isArray(doc.extractedData)) {
    return doc.extractedData as Record<string, unknown>;
  }
  return (doc.reviewedData as Record<string, unknown> | null) ?? null;
}

function getMissingItems(doc: Document): string[] {
  const data = effectiveDocumentData(doc);
  const items = data?.missingItems;
  return Array.isArray(items) ? items.map(String) : [];
}


/** AI 가 적어둔 관찰 메모를 툴팁 문구로 만든다. 판정이 아니라는 점을 먼저 밝힌다. */
function aiNoteTooltip(items: string[]): string {
  const nl = String.fromCharCode(10);
  return 'AI 가 적어둔 참고 메모입니다 (판정 아님):' + nl + nl + items.join(nl);
}

export function DocumentsPage() {
  const { currentBusinessId, currentBusiness } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [analyzingSelected, setAnalyzingSelected] = useState(false);
  // Shift 범위 선택의 기준점 — 마지막으로 누른 줄.
  const lastClickedIdRef = useRef<string | null>(null);
  const [uploadDocumentType, setUploadDocumentType] = useState<DocumentTypeCode | ''>('');
  const [uploadCompanyId, setUploadCompanyId] = useState<string>('');
  const [combinedTarget, setCombinedTarget] = useState<Document | null>(null);
  const [combinedCompanyId, setCombinedCompanyId] = useState<string>('');
  const [reviewing, setReviewing] = useState<Document | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [checklistCompanyId, setChecklistCompanyId] = useState('');
  // 서류 구분(기업/근로자/지원금) 필터. 구분 정의는 필수서류 원장의 stage.target 을 그대로 쓴다 —
  // 화면에서 따로 목록을 만들면 원장이 바뀔 때 조용히 어긋난다.
  const [docGroup, setDocGroup] = useState<DocGroup>('ALL');
  const [stageDefs, setStageDefs] = useState<RequiredDocumentStage[]>([]);
  const [checklistWorkerId, setChecklistWorkerId] = useState('');
  const [validationCompanyId, setValidationCompanyId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const workerMap = useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);
  const documentTypeLabelMap = useMemo(
    () => new Map<string, string>(documentTypes.map((t) => [t.code, t.label])),
    [documentTypes],
  );

  const documentTypeLabel = (code?: string | null): string => {
    if (!code) return '-';
    return documentTypeLabelMap.get(code) ?? '미분류';
  };

  const load = async () => {
    if (viewMode === 'checklist' || viewMode === 'validation') return;
    setLoading(true);
    setError(null);
    try {
      const data =
        viewMode === 'unassigned'
          ? await documentsApi.list({ unassigned: true })
          : await documentsApi.list({ businessId: currentBusinessId ?? undefined });
      setDocuments(data);
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 체크박스 선택.
   *
   * Shift 를 누른 채 누르면 **직전에 누른 줄부터 지금 줄까지**를 한 번에 켠다.
   * 범위는 지금 화면에 보이는 순서(visibleDocuments) 기준이다 — 구분 필터로 걸러낸 뒤에는
   * 안 보이는 줄까지 같이 켜지면 사용자가 의도하지 않은 문서를 분석하게 된다.
   *
   * Shift 범위 선택은 **항상 켜기**다(토글이 아니다). 엑셀·파일탐색기와 같은 동작이고,
   * 여러 건을 고르려는 의도일 때 중간이 꺼져버리는 일을 막는다.
   */
  const toggleSelect = (id: string, shiftKey = false) => {
    const list = visibleDocuments;
    // 기준점은 updater 안에서 읽으면 안 된다 — setSelectedIds 의 함수형 updater 는 나중에 실행되는데
    // 아래에서 ref 를 먼저 덮어쓰기 때문에, 실행 시점에는 이미 방금 누른 줄로 바뀌어 있다
    // (그래서 범위가 항상 1칸으로 잡혔다). 호출 시점의 값을 지금 붙잡아 둔다.
    const anchor = lastClickedIdRef.current;
    const from = anchor ? list.findIndex((d) => d.id === anchor) : -1;
    const to = list.findIndex((d) => d.id === id);

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && from !== -1 && to !== -1) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        for (let i = lo; i <= hi; i++) next.add(list[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Shift 로 범위를 잡은 뒤에도 기준점은 '마지막으로 누른 줄'로 옮긴다(엑셀과 같은 동작).
    lastClickedIdRef.current = id;
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === visibleDocuments.length && visibleDocuments.length > 0
        ? new Set()
        : new Set(visibleDocuments.map((d) => d.id)),
    );
    lastClickedIdRef.current = null;
  };

  const handleAnalyzeSelected = async () => {
    if (selectedIds.size === 0) return;
    setAnalyzingSelected(true);
    const targets = documents.filter((d) => selectedIds.has(d.id));
    for (const doc of targets) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: DocumentAnalysisStatus.ANALYZING } : d)));
      try {
        const updated = await documentsApi.analyze(doc.id);
        setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      } catch (e) {
        window.alert(`'${doc.fileName}' 분석 실패: ${e instanceof Error ? e.message : '오류'}`);
      }
    }
    setSelectedIds(new Set());
    setAnalyzingSelected(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, viewMode]);

  useEffect(() => {
    companiesApi.list().then(setCompanies).catch(() => undefined);
    workersApi.list({ businessId: currentBusinessId ?? undefined }).then(setWorkers).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId]);

  useEffect(() => {
    requiredDocumentsApi.documentTypes().then(setDocumentTypes).catch(() => undefined);
  }, []);

  // 현재 사업의 단계별 필수서류 정의 → 서류종류가 어느 구분에 속하는지 알아낸다.
  useEffect(() => {
    const typeCode = currentBusiness?.typeCode;
    if (!typeCode) {
      setStageDefs([]);
      return;
    }
    requiredDocumentsApi
      .findByTypeCode(typeCode)
      .then((def) => setStageDefs(def?.stages ?? []))
      .catch(() => setStageDefs([]));
  }, [currentBusiness?.typeCode]);

  /**
   * 서류종류 → 구분 집합.
   * 한 종류가 두 구분에 들어갈 수 있다 (근로계약서는 근로자 서류이면서 지원금 증빙이기도 하다).
   */
  const groupsByType = useMemo(() => {
    const m = new Map<string, Set<DocGroup>>();
    for (const stage of stageDefs) {
      const g = stage.target as DocGroup;
      if (g !== 'COMPANY' && g !== 'WORKER' && g !== 'SUBSIDY') continue;
      for (const code of [...stage.documents, ...(stage.optional ?? [])]) {
        if (!m.has(code)) m.set(code, new Set());
        m.get(code)!.add(g);
      }
    }
    return m;
  }, [stageDefs]);

  const visibleDocuments = useMemo(() => {
    if (docGroup === 'ALL') return documents;
    if (docGroup === 'NONE') {
      return documents.filter((d) => !d.documentType || !groupsByType.has(d.documentType));
    }
    return documents.filter((d) => !!d.documentType && groupsByType.get(d.documentType)?.has(docGroup));
  }, [documents, docGroup, groupsByType]);

  const groupCount = (g: DocGroup): number => {
    if (g === 'ALL') return documents.length;
    if (g === 'NONE') return documents.filter((d) => !d.documentType || !groupsByType.has(d.documentType)).length;
    return documents.filter((d) => !!d.documentType && groupsByType.get(d.documentType)?.has(g)).length;
  };

  const handleAssignToCurrentBusiness = async (doc: Document) => {
    if (!currentBusinessId) return;
    try {
      const updated = await documentsApi.update(doc.id, { businessId: currentBusinessId });
      setDocuments((prev) => prev.filter((d) => d.id !== updated.id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '사업 지정에 실패했습니다.');
    }
  };

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
    if (!currentBusinessId) {
      window.alert('사업을 먼저 선택하세요.');
      return;
    }
    setUploading(true);
    try {
      await documentsApi.upload(file, {
        businessId: currentBusinessId,
        documentType: uploadDocumentType || undefined,
        companyId: uploadCompanyId || undefined,
      });
      setUploadDocumentType('');
      setUploadCompanyId('');
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

  const handleAnalyzeCombined = async (doc: Document, companyId?: string) => {
    setCombinedTarget(null);
    setCombinedCompanyId('');
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: DocumentAnalysisStatus.ANALYZING } : d)));
    try {
      const updated = await documentsApi.analyzeCombined(doc.id, companyId || undefined, currentBusinessId || undefined);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '합본 분석에 실패했습니다.');
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 문서 ${selectedIds.size}건을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const errors: string[] = [];
    for (const doc of documents.filter((d) => selectedIds.has(d.id))) {
      try {
        await documentsApi.remove(doc.id);
      } catch {
        errors.push(doc.fileName);
      }
    }
    if (errors.length) window.alert(`${errors.length}건 삭제 실패:\n${errors.join('\n')}`);
    await load();
  };

  return (
    <div className="page">
      <div className="sub-tab-nav">
        <button
          className={`btn btn-sm ${viewMode === 'current' ? 'btn-primary' : ''}`}
          onClick={() => setViewMode('current')}
        >
          현재 사업 문서
        </button>
        <button
          className={`btn btn-sm ${viewMode === 'unassigned' ? 'btn-primary' : ''}`}
          onClick={() => setViewMode('unassigned')}
        >
          미분류 문서
        </button>
        <button
          className={`btn btn-sm ${viewMode === 'checklist' ? 'btn-primary' : ''}`}
          onClick={() => setViewMode('checklist')}
        >
          필수서류 체크리스트
        </button>
        <button
          className={`btn btn-sm ${viewMode === 'validation' ? 'btn-primary' : ''}`}
          onClick={() => setViewMode('validation')}
        >
          기업 신청 검증
        </button>
      </div>

      {viewMode === 'validation' ? (
        <div>
          <p className="hint-text">기업을 선택하면 해당 기업 신청 건의 서류 대조·검증 결과를 확인하고 승인할 수 있습니다.</p>
          <div className="toolbar">
            <div className="toolbar-left">
              <select
                className="select-input"
                value={validationCompanyId}
                onChange={(e) => setValidationCompanyId(e.target.value)}
              >
                <option value="">기업 선택</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              onClick={() =>
                downloadFile(
                  `/companies/ledger/export?businessId=${encodeURIComponent(currentBusinessId ?? '')}`,
                  'company-ledger.xlsx',
                ).catch((e) => window.alert(e instanceof Error ? e.message : '내보내기에 실패했습니다.'))
              }
            >
              참여기업 관리대장 내보내기
            </button>
          </div>
          {!validationCompanyId && <p className="hint-text">기업을 선택하세요.</p>}
          {currentBusinessId && validationCompanyId && (
            <CompanyValidationPanel
              key={`${currentBusinessId}:${validationCompanyId}`}
              businessId={currentBusinessId}
              companyId={validationCompanyId}
            />
          )}
        </div>
      ) : viewMode === 'checklist' ? (
        <div>
          <p className="hint-text">기업 또는 근로자를 선택하면 해당 대상에 적용되는 단계별 필수서류 제출 여부를 보여줍니다.</p>
          <div className="toolbar">
            <div className="toolbar-left">
              <select
                className="select-input"
                value={checklistCompanyId}
                onChange={(e) => {
                  setChecklistCompanyId(e.target.value);
                  if (e.target.value) setChecklistWorkerId('');
                }}
              >
                <option value="">기업 선택 (기업 적격 서류)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="select-input"
                value={checklistWorkerId}
                onChange={(e) => {
                  setChecklistWorkerId(e.target.value);
                  if (e.target.value) setChecklistCompanyId('');
                }}
              >
                <option value="">근로자 선택 (참여자·지원금 서류)</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!checklistCompanyId && !checklistWorkerId && (
            <p className="hint-text">기업 또는 근로자를 선택하세요.</p>
          )}
          {currentBusinessId && currentBusiness && checklistCompanyId && (
            <RequiredDocumentsChecklist
              businessId={currentBusinessId}
              typeCode={currentBusiness.typeCode}
              target="COMPANY"
              targetId={checklistCompanyId}
            />
          )}
          {currentBusinessId && currentBusiness && checklistWorkerId && (
            <RequiredDocumentsChecklist
              businessId={currentBusinessId}
              typeCode={currentBusiness.typeCode}
              target="WORKER"
              targetId={checklistWorkerId}
            />
          )}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="toolbar-left">
              <p className="hint-text">
                {viewMode === 'unassigned'
                  ? '메일 자동수집 시 발신 기업이 여러 사업에 참여 중이거나 매칭되지 않아 사업이 지정되지 않은 문서입니다.'
                  : '메일로 회신된 첨부파일을 자동 수집하거나, PDF/이미지/HWP 문서를 직접 업로드해 AI로 분석할 수 있습니다.'}
              </p>
            </div>
            <div className="toolbar-left">
              <button
                className="btn btn-primary"
                onClick={handleAnalyzeSelected}
                disabled={selectedIds.size === 0 || analyzingSelected}
              >
                {analyzingSelected ? '분석 중...' : `선택 분석 (${selectedIds.size})`}
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
              >
                선택 삭제 ({selectedIds.size})
              </button>
              <button className="btn" onClick={() => documentsApi.exportReport()}>
                AI 검토 보고서 다운로드
              </button>
              <button className="btn" disabled={collecting} onClick={handleCollect}>
                {collecting ? '수집 중...' : '첨부파일 수집'}
              </button>
              {viewMode === 'current' && (
                <>
                  <select
                    className="select-input"
                    value={uploadCompanyId}
                    onChange={(e) => setUploadCompanyId(e.target.value)}
                  >
                    <option value="">기업 미지정 (AI 자동 연결)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select-input"
                    value={uploadDocumentType}
                    onChange={(e) => setUploadDocumentType(e.target.value as DocumentTypeCode | '')}
                  >
                    <option value="">문서종류: AI 자동 분류</option>
                    {documentTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                className="btn btn-primary"
                disabled={uploading || viewMode !== 'current'}
                onClick={() => fileInputRef.current?.click()}
              >
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

          {/* 서류 구분 필터 + Shift 선택 안내 */}
          <div className="card" style={{ padding: '0.6rem 0.8rem', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, marginRight: '0.2rem' }}>구분</span>
              {(['ALL', 'COMPANY', 'WORKER', 'SUBSIDY', 'NONE'] as DocGroup[]).map((g) => {
                const n = groupCount(g);
                return (
                  <button
                    key={g}
                    className={`btn btn-sm ${docGroup === g ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setDocGroup(g);
                      // 구분을 바꾸면 안 보이는 문서가 선택된 채로 남지 않게 비운다.
                      setSelectedIds(new Set());
                      lastClickedIdRef.current = null;
                    }}
                  >
                    {DOC_GROUP_LABEL[g]} ({n})
                  </button>
                );
              })}
            </div>
            <p className="hint-text" style={{ margin: '0.4rem 0 0' }}>
              체크박스를 누른 뒤 <strong>Shift</strong> 를 누른 채 다른 줄을 누르면 그 사이가 모두 선택됩니다.
              근로계약서처럼 근로자·지원금 양쪽에 쓰이는 서류는 두 구분 모두에 나옵니다.
            </p>
          </div>

          <div className="card">
            <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '2rem' }}>
                <input
                  type="checkbox"
                  checked={visibleDocuments.length > 0 && selectedIds.size === visibleDocuments.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>파일명</th>
              <th>문서종류</th>
              <th>출처</th>
              <th>연결된 기업/근로자</th>
              <th>상태</th>
              <th>AI 참고</th>
              <th>등록일시</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="empty-row">
                <td colSpan={9}>불러오는 중...</td>
              </tr>
            )}
            {!loading && visibleDocuments.length === 0 && (
              <tr className="empty-row">
                <td colSpan={9}>
                  {documents.length === 0
                    ? '등록된 문서가 없습니다.'
                    : `이 구분(${DOC_GROUP_LABEL[docGroup]})에 해당하는 문서가 없습니다.`}
                </td>
              </tr>
            )}
            {!loading &&
              visibleDocuments.map((doc) => {
                const missingItems = getMissingItems(doc);
                return (
                <tr key={doc.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.id)}
                      // onChange 이벤트에는 shiftKey 가 없다. 클릭에서 받아 직접 처리한다.
                      onChange={() => undefined}
                      onClick={(e) => toggleSelect(doc.id, e.shiftKey)}
                    />
                  </td>
                  <td>{doc.fileName}</td>
                  <td>{documentTypeLabel(doc.documentType)}</td>
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
                      // AI 가 적어둔 관찰 메모다. 서류 미비 '판정'이 아니다 (설계서 §9.3).
                      // 실제 미비 판정은 검증 결과에서 규칙으로 나온다.
                      <span
                        className="badge badge-pending"
                        title={aiNoteTooltip(missingItems)}
                      >
                        참고 {missingItems.length}건
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{new Date(doc.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="actions">
                    {viewMode === 'unassigned' && (
                      <button className="btn btn-sm" onClick={() => handleAssignToCurrentBusiness(doc)}>
                        현재 사업으로 지정
                      </button>
                    )}
                    {doc.status === DocumentAnalysisStatus.PENDING ? (
                      <>
                        <button className="btn btn-sm" onClick={() => handleAnalyze(doc)}>
                          분석
                        </button>
                        {(doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf')) && (
                          <button className="btn btn-sm btn-primary" onClick={() => { setCombinedTarget(doc); setCombinedCompanyId(doc.companyId ?? ''); }}>
                            합본 분석
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm" onClick={() => setReviewing(doc)}>
                          검토
                        </button>
                        {(doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf')) && (
                          <button className="btn btn-sm btn-primary" onClick={() => { setCombinedTarget(doc); setCombinedCompanyId(doc.companyId ?? ''); }}>
                            합본 재분석
                          </button>
                        )}
                      </>
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
          </div>
        </>
      )}

      {combinedTarget && (
        <Modal title="합본 분석 — 기업 선택" onClose={() => { setCombinedTarget(null); setCombinedCompanyId(''); }}>
          <h3 style={{ marginTop: 0 }}>합본 분석 — 기업 선택</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            이 PDF가 어느 기업의 서류인지 선택하면 분리된 문서가 해당 기업에 자동 연결됩니다.
          </p>
          <select
            className="select-input"
            style={{ width: '100%', marginBottom: '1rem' }}
            value={combinedCompanyId}
            onChange={(e) => setCombinedCompanyId(e.target.value)}
          >
            <option value="">기업 미지정 (AI 자동 연결 시도)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setCombinedTarget(null); setCombinedCompanyId(''); }}>
              취소
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleAnalyzeCombined(combinedTarget, combinedCompanyId)}
            >
              분석 시작
            </button>
          </div>
        </Modal>
      )}

      {reviewing && (
        <DocumentReviewModal
          document={reviewing}
          companies={companies}
          workers={workers}
          documentTypes={documentTypes}
          businessId={reviewing.businessId ?? currentBusinessId ?? ''}
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
  documentTypes,
  businessId,
  onClose,
  onAnalyze,
  onSaved,
}: {
  document: Document;
  companies: Company[];
  workers: Worker[];
  documentTypes: DocumentTypeDef[];
  businessId: string;
  onClose: () => void;
  onAnalyze: () => void;
  onSaved: (updated: Document) => void;
}) {
  const initialData = effectiveDocumentData(document) ?? {};
  const [jsonText, setJsonText] = useState(JSON.stringify(initialData, null, 2));
  const [companyId, setCompanyId] = useState(document.companyId ?? '');
  const [workerId, setWorkerId] = useState(document.workerId ?? '');
  const [documentType, setDocumentType] = useState<DocumentTypeCode | ''>(
    (documentTypes.some((t) => t.code === document.documentType) ? document.documentType : '') as DocumentTypeCode | '',
  );
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
        businessId,
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
        documentType: documentType || undefined,
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
          <label>문서종류</label>
          <select
            className="select-input"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentTypeCode | '')}
          >
            <option value="">미분류</option>
            {documentTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
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
