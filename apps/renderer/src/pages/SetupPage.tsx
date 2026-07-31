import { useState } from 'react';
import { BUSINESS_TYPE_CODES, BUSINESS_TYPE_LABELS } from '@job-program/shared';
import { useAuth } from '../auth/AuthContext';

const STEP_TITLES = ['기관 생성', '관리자 담당자 생성', '첫 사업 등록'];

export function SetupPage() {
  const { setup } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [institutionName, setInstitutionName] = useState('');
  const [adminLoginId, setAdminLoginId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [adminName, setAdminName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessTypeCode, setBusinessTypeCode] = useState<string>(BUSINESS_TYPE_CODES[0]);
  const [businessBaseYear, setBusinessBaseYear] = useState(String(new Date().getFullYear()));

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!institutionName.trim()) return '기관명을 입력하세요.';
    }
    if (step === 1) {
      if (adminLoginId.trim().length < 4) return '로그인ID는 4자 이상이어야 합니다.';
      if (adminPassword.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
      if (adminPassword !== adminPasswordConfirm) return '비밀번호가 일치하지 않습니다.';
      if (!adminName.trim()) return '이름을 입력하세요.';
    }
    if (step === 2) {
      if (!businessName.trim()) return '사업명을 입력하세요.';
      if (!/^[A-Z0-9_]+$/.test(businessTypeCode)) return '유형코드는 영문 대문자·숫자·언더스코어만 가능합니다.';
      const year = Number(businessBaseYear);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return '기준연도를 올바르게 입력하세요.';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => s + 1);
  };

  const goPrev = () => {
    setError(null);
    setStep((s) => s - 1);
  };

  const handleComplete = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setup({
        institutionName: institutionName.trim(),
        adminLoginId: adminLoginId.trim(),
        adminPassword,
        adminName: adminName.trim(),
        businessName: businessName.trim(),
        businessTypeCode,
        businessBaseYear: Number(businessBaseYear),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '초기 설정에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <h1>잡도리 AI 최초 설정</h1>
        <p className="hint-text">
          {STEP_TITLES.map((t, i) => (
            <span key={t} className={i === step ? 'setup-step active' : 'setup-step'}>
              {i + 1}. {t}
              {i < STEP_TITLES.length - 1 ? ' → ' : ''}
            </span>
          ))}
        </p>

        {step === 0 && (
          <div className="field full" style={{ marginBottom: '0.85rem' }}>
            <label className="required">기관명</label>
            <input
              className="text-input"
              style={{ width: '100%' }}
              autoFocus
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
            />
          </div>
        )}

        {step === 1 && (
          <>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">로그인ID</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                autoFocus
                value={adminLoginId}
                onChange={(e) => setAdminLoginId(e.target.value)}
              />
            </div>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">비밀번호 (8자 이상)</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">비밀번호 확인</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                type="password"
                value={adminPasswordConfirm}
                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
              />
            </div>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">이름</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field full" style={{ marginBottom: '0.85rem' }}>
              <label className="required">사업명</label>
              <input
                className="text-input"
                style={{ width: '100%' }}
                autoFocus
                placeholder="예: 2026년 시니어인턴십"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="form-grid" style={{ marginBottom: '0.85rem' }}>
              <div className="field">
                <label className="required">사업유형코드</label>
                <select
                  className="select-input"
                  value={businessTypeCode}
                  onChange={(e) => setBusinessTypeCode(e.target.value)}
                >
                  {BUSINESS_TYPE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code} ({BUSINESS_TYPE_LABELS[code]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="required">기준연도</label>
                <input
                  className="text-input"
                  type="number"
                  value={businessBaseYear}
                  onChange={(e) => setBusinessBaseYear(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn" disabled={step === 0} onClick={goPrev}>
            이전
          </button>
          {step < STEP_TITLES.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              다음
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleComplete}>
              {submitting ? '설정 중...' : '완료'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
