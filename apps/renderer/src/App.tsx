import { useEffect, useState } from 'react';
import type { ApiResponse } from '@job-program/shared';
import { GuidePage } from './pages/GuidePage';
import { NewBizPage } from './pages/NewBizPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { WorkersPage } from './pages/WorkersPage';
import { MailPage } from './pages/MailPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { SubsidyPage } from './pages/SubsidyPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ComplaintsPage } from './pages/ComplaintsPage';

const apiBaseUrl = window.api?.apiBaseUrl ?? 'http://localhost:3000';

type Tab =
  | 'guide'
  | 'newbiz'
  | 'companies'
  | 'workers'
  | 'mail'
  | 'documents'
  | 'subsidy'
  | 'evaluation'
  | 'complaints';

function App() {
  const [tab, setTab] = useState<Tab>('guide');
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${apiBaseUrl}/health`)
      .then((res) => res.json() as Promise<ApiResponse<unknown>>)
      .then((res) => setConnected(Boolean(res.success)))
      .catch(() => setConnected(false));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>일자리사업 행정자동화 플랫폼</h1>
        <span className={`conn-status ${connected === false ? 'error' : ''}`}>
          {connected === null && '서버 연결 확인 중...'}
          {connected === true && '서버 연결됨'}
          {connected === false && '서버에 연결할 수 없습니다.'}
        </span>
      </header>

      <nav className="tab-nav">
        <button className={`tab-button ${tab === 'guide' ? 'active' : ''}`} onClick={() => setTab('guide')}>
          사용 가이드
        </button>
        <button className={`tab-button ${tab === 'newbiz' ? 'active' : ''}`} onClick={() => setTab('newbiz')}>
          신사업 알리미
        </button>
        <button className={`tab-button ${tab === 'companies' ? 'active' : ''}`} onClick={() => setTab('companies')}>
          기업 관리
        </button>
        <button className={`tab-button ${tab === 'workers' ? 'active' : ''}`} onClick={() => setTab('workers')}>
          근로자 관리
        </button>
        <button className={`tab-button ${tab === 'mail' ? 'active' : ''}`} onClick={() => setTab('mail')}>
          메일 관리
        </button>
        <button className={`tab-button ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>
          문서함
        </button>
        <button className={`tab-button ${tab === 'subsidy' ? 'active' : ''}`} onClick={() => setTab('subsidy')}>
          지원금 안내
        </button>
        <button className={`tab-button ${tab === 'evaluation' ? 'active' : ''}`} onClick={() => setTab('evaluation')}>
          평가 대응
        </button>
        <button className={`tab-button ${tab === 'complaints' ? 'active' : ''}`} onClick={() => setTab('complaints')}>
          민원응대
        </button>
      </nav>

      {tab === 'guide' && <GuidePage />}
      {tab === 'newbiz' && <NewBizPage />}
      {tab === 'companies' && <CompaniesPage />}
      {tab === 'workers' && <WorkersPage />}
      {tab === 'mail' && <MailPage />}
      {tab === 'documents' && <DocumentsPage />}
      {tab === 'subsidy' && <SubsidyPage />}
      {tab === 'evaluation' && <EvaluationPage />}
      {tab === 'complaints' && <ComplaintsPage />}
    </div>
  );
}

export default App;
