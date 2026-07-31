import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { SetupPage } from './pages/SetupPage';
import { LoginPage } from './pages/LoginPage';
import { GuidePage } from './pages/GuidePage';
import { NewBizPage } from './pages/NewBizPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { WorkersPage } from './pages/WorkersPage';
import { MailPage } from './pages/MailPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { SubsidyPage } from './pages/SubsidyPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ComplaintsPage } from './pages/ComplaintsPage';

function RootRoutes() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <p className="hint-text">불러오는 중...</p>
      </div>
    );
  }

  if (status === 'needs-setup') {
    return (
      <Routes>
        <Route path="*" element={<SetupPage />} />
      </Routes>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/newbiz" element={<NewBizPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/mail" element={<MailPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/subsidy" element={<SubsidyPage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
        <Route path="/complaints" element={<ComplaintsPage />} />
        <Route path="*" element={<Navigate to="/guide" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RootRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
