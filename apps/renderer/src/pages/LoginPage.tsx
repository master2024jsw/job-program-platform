import { useEffect, useState } from 'react';
import { BUSINESS_TYPE_CODES, BUSINESS_TYPE_LABELS } from '@job-program/shared';
import { useAuth } from '../auth/AuthContext';
import { requiredDocumentsApi } from '../api/required-documents';

export function LoginPage() {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [businessTypeCode, setBusinessTypeCode] = useState<string>(BUSINESS_TYPE_CODES[0]);
  const [readyTypeCodes, setReadyTypeCodes] = useState<Set<string>>(new Set());
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetNoticeOpen, setResetNoticeOpen] = useState(false);

  useEffect(() => {
    Promise.all(
      BUSINESS_TYPE_CODES.map((code) =>
        requiredDocumentsApi.findByTypeCode(code).then((def) => [code, def !== null] as const),
      ),
    )
      .then((results) => setReadyTypeCodes(new Set(results.filter(([, ready]) => ready).map(([code]) => code))))
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ loginId, password, businessTypeCode, keepLoggedIn });
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>잡도리 AI</h1>
        <p className="hint-text">일자리사업 행정자동화 플랫폼</p>

        <form onSubmit={handleSubmit}>
          <div className="field full" style={{ marginBottom: '0.85rem' }}>
            <label className="required">로그인ID</label>
            <input
              className="text-input"
              style={{ width: '100%' }}
              required
              autoFocus
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </div>
          <div className="field full" style={{ marginBottom: '0.85rem' }}>
            <label className="required">비밀번호</label>
            <input
              className="text-input"
              style={{ width: '100%' }}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field full" style={{ marginBottom: '0.85rem' }}>
            <label className="required">사업 선택</label>
            <select
              className="select-input"
              style={{ width: '100%' }}
              value={businessTypeCode}
              onChange={(e) => setBusinessTypeCode(e.target.value)}
              required
            >
              {BUSINESS_TYPE_CODES.map((code) => {
                const ready = readyTypeCodes.has(code);
                return (
                  <option key={code} value={code} disabled={!ready}>
                    {BUSINESS_TYPE_LABELS[code]}
                    {ready ? '' : ' (준비중)'}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="field full" style={{ marginBottom: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input type="checkbox" checked={keepLoggedIn} onChange={(e) => setKeepLoggedIn(e.target.checked)} />
              자동 로그인 유지 (공용 PC에서는 권장하지 않습니다)
            </label>
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-sm" onClick={() => setResetNoticeOpen(true)}>
              비밀번호 재설정
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </form>

        {resetNoticeOpen && (
          <p className="hint-text" style={{ marginTop: '0.85rem' }}>
            비밀번호를 잊으셨다면 기관 관리자에게 초기화를 요청해주세요.{' '}
            <button type="button" className="btn btn-sm" onClick={() => setResetNoticeOpen(false)}>
              확인
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
