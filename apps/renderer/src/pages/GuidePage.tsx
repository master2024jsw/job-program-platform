import { downloadFile } from '../api/client';
import {
  FLOW_STEPS,
  GETTING_STARTED_STEPS,
  INTRO_TEXT,
  SECURITY_TEXT,
  SERVER_MODE_TEXT,
  TAB_GUIDES,
} from '../content/guide-content';

const STANDARD_TEMPLATE_FILENAME = '잡도리AI_표준양식.xlsx';

export function GuidePage() {
  const handleDownloadTemplate = () => {
    downloadFile('/resources/standard-template', STANDARD_TEMPLATE_FILENAME).catch((e) => {
      window.alert(e instanceof Error ? e.message : '표준양식 다운로드에 실패했습니다.');
    });
  };

  return (
    <div className="page">
      <section className="guide-section">
        <h2>이 프로그램은 무엇을 하나요?</h2>
        <p className="hint-text" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          {INTRO_TEXT}
        </p>
        <p className="hint-text" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          {SERVER_MODE_TEXT}
        </p>
      </section>

      <section className="guide-section">
        <h2>대상기업 표준양식</h2>
        <p className="hint-text" style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
          [기업 DB] 화면에서 기업을 대량으로 등록할 때 사용하는 엑셀 양식입니다. 아래 버튼으로 받은 파일의 열 구성
          그대로 채워서 업로드하면 자동으로 인식됩니다.
        </p>
        <button className="btn btn-primary" onClick={handleDownloadTemplate}>
          대상기업 표준양식 다운로드
        </button>
      </section>

      <section className="guide-section">
        <h2>전체 업무 흐름</h2>
        <div className="guide-flow">
          {FLOW_STEPS.map((step) => (
            <div key={step.title} className={`guide-step ${step.future ? 'future' : ''}`}>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <h2>탭별 사용법</h2>
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>탭</th>
                <th>이럴 때 사용하세요</th>
                <th>주요 기능</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {TAB_GUIDES.map((t) => (
                <tr key={t.name}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ whiteSpace: 'normal' }}>{t.when}</td>
                  <td style={{ whiteSpace: 'normal' }}>{t.features}</td>
                  <td>
                    <span className={`badge ${t.ready ? 'badge-active' : 'badge-inactive'}`}>
                      {t.ready ? '사용 가능' : '준비중'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="guide-section">
        <h2>처음 사용하신다면 이 순서로 진행하세요</h2>
        <ol className="guide-checklist">
          {GETTING_STARTED_STEPS.map((item, i) => (
            <li key={i}>
              <span className="num">{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section">
        <h2>보안 안내</h2>
        <p className="hint-text" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          {SECURITY_TEXT}
        </p>
      </section>
    </div>
  );
}
