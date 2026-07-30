import type { ImportSummary } from '../api/client';
import { Modal } from './Modal';

export function ImportResultModal({ summary, onClose }: { summary: ImportSummary; onClose: () => void }) {
  return (
    <Modal title="엑셀 업로드 결과" onClose={onClose}>
      <p>
        신규 등록 <strong>{summary.created}</strong>건 · 수정 <strong>{summary.updated}</strong>건
        {summary.errors.length > 0 && (
          <>
            {' '}
            · 실패 <strong>{summary.errors.length}</strong>건
          </>
        )}
      </p>
      {summary.errors.length > 0 && (
        <div className="card" style={{ maxHeight: 260, overflowY: 'auto', marginTop: '0.75rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>행</th>
                <th>오류 내용</th>
              </tr>
            </thead>
            <tbody>
              {summary.errors.map((e, idx) => (
                <tr key={idx}>
                  <td>{e.row}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          확인
        </button>
      </div>
    </Modal>
  );
}
