import { useEffect, useState } from 'react';
import type { DocumentTypeDef, RequiredDocumentStage } from '@job-program/shared';
import { requiredDocumentsApi } from '../api/required-documents';
import { documentsApi } from '../api/documents';

interface RequiredDocumentsChecklistProps {
  businessId: string;
  typeCode: string;
  target: 'COMPANY' | 'WORKER';
  targetId: string;
}

/** 선택한 기업/근로자 기준으로, 해당 대상(target)에 적용되는 단계별 필수서류 제출 여부를 보여준다. */
export function RequiredDocumentsChecklist({ businessId, typeCode, target, targetId }: RequiredDocumentsChecklistProps) {
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDef[]>([]);
  const [stages, setStages] = useState<RequiredDocumentStage[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [submittedCodes, setSubmittedCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requiredDocumentsApi.documentTypes().then(setDocumentTypes).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotReady(false);
    setStages(null);

    requiredDocumentsApi
      .findByTypeCode(typeCode)
      .then((def) => {
        if (cancelled) return;
        if (!def) {
          setNotReady(true);
          setStages([]);
          return;
        }
        setStages(def.stages.filter((s) => s.target === target));
      })
      .catch(() => {
        if (!cancelled) setStages([]);
      });

    documentsApi
      .list(target === 'COMPANY' ? { businessId, companyId: targetId } : { businessId, workerId: targetId })
      .then((docs) => {
        if (cancelled) return;
        setSubmittedCodes(new Set(docs.filter((d) => !!d.documentType).map((d) => d.documentType as string)));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, typeCode, target, targetId]);

  const labelOf = (code: string): string => documentTypes.find((t) => t.code === code)?.label ?? code;

  if (loading) return <p className="hint-text">불러오는 중...</p>;
  if (notReady) return <p className="hint-text">이 사업 유형은 아직 필수서류 데이터가 준비되지 않았습니다.</p>;
  if (!stages || stages.length === 0) {
    return <p className="hint-text">해당 대상에 적용되는 필수서류 단계가 없습니다.</p>;
  }

  return (
    <div>
      {stages.map((stage) => (
        <div key={stage.stage} className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{stage.label}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {stage.documents.map((code) => {
              const submitted = submittedCodes.has(code);
              return (
                <li key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`badge ${submitted ? 'badge-active' : 'badge-failed'}`}>
                    {submitted ? '제출' : '미제출'}
                  </span>
                  <span>{labelOf(code)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
