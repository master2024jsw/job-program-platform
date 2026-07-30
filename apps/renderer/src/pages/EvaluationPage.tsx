const notReady = () => window.alert('준비 중인 기능입니다. 추후 개발될 예정입니다.');

export function EvaluationPage() {
  return (
    <div className="page">
      <p className="hint-text">운영기관 평가 대응 기능은 준비 중입니다. 아래 버튼은 향후 개발될 기능의 자리입니다.</p>
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 420 }}>
        <button className="btn" onClick={notReady}>
          평가항목 체크리스트 자동생성 (준비중)
        </button>
        <button className="btn" onClick={notReady}>
          평가보고서 초안 작성 (준비중)
        </button>
        <button className="btn" onClick={notReady}>
          점검서류 PDF 정리 (준비중)
        </button>
      </div>
    </div>
  );
}
