const notReady = () => window.alert('준비 중인 기능입니다. 추후 개발될 예정입니다.');

export function ComplaintsPage() {
  return (
    <div className="page">
      <p className="hint-text">
        민원응대·인수인계 AI 기능은 준비 중입니다. 아래 버튼은 향후 개발될 기능의 자리입니다.
      </p>
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 420 }}>
        <button className="btn" onClick={notReady}>
          AI 챗봇 상담 시작 (준비중)
        </button>
        <button className="btn" onClick={notReady}>
          인수인계 히스토리 보기 (준비중)
        </button>
        <button className="btn" onClick={notReady}>
          근로기준법·지침 해석 질의 (준비중)
        </button>
      </div>
    </div>
  );
}
