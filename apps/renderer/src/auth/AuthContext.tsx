import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Business, SessionUser } from '@job-program/shared';
import { authApi, type LoginInput, type SetupInput } from '../api/auth';
import { businessesApi } from '../api/businesses';
import { ApiError } from '../api/client';

type AuthStatus = 'loading' | 'needs-setup' | 'unauthenticated' | 'authenticated';

const CURRENT_BUSINESS_KEY = 'jobdori.currentBusinessId';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  businesses: Business[];
  currentBusinessId: string | null;
  currentBusiness: Business | null;
  setCurrentBusinessId: (id: string) => void;
  refreshBusinesses: () => Promise<void>;
  login: (dto: LoginInput) => Promise<void>;
  setup: (dto: SetupInput) => Promise<void>;
  logout: () => Promise<void>;
  recheck: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessIdState] = useState<string | null>(
    () => sessionStorage.getItem(CURRENT_BUSINESS_KEY),
  );

  const setCurrentBusinessId = useCallback((id: string) => {
    setCurrentBusinessIdState(id);
    sessionStorage.setItem(CURRENT_BUSINESS_KEY, id);
  }, []);

  const refreshBusinesses = useCallback(async () => {
    const list = await businessesApi.list();
    setBusinesses(list);
    setCurrentBusinessIdState((prev) => {
      const next = prev && list.some((b) => b.id === prev) ? prev : (list[0]?.id ?? null);
      if (next) sessionStorage.setItem(CURRENT_BUSINESS_KEY, next);
      return next;
    });
  }, []);

  const recheck = useCallback(async () => {
    setStatus('loading');
    try {
      const setupStatus = await authApi.setupStatus();
      if (setupStatus.needsSetup) {
        setStatus('needs-setup');
        return;
      }
      const me = await authApi.me();
      setUser(me);
      await refreshBusinesses();
      setStatus('authenticated');
    } catch {
      setUser(null);
      setBusinesses([]);
      setCurrentBusinessIdState(null);
      sessionStorage.removeItem(CURRENT_BUSINESS_KEY);
      setStatus('unauthenticated');
    }
  }, [refreshBusinesses]);

  useEffect(() => {
    recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      setBusinesses([]);
      setCurrentBusinessIdState(null);
      sessionStorage.removeItem(CURRENT_BUSINESS_KEY);
      setStatus('unauthenticated');
    };
    window.addEventListener('session:expired', handler);
    return () => window.removeEventListener('session:expired', handler);
  }, []);

  const login = useCallback(
    async (dto: LoginInput) => {
      const { businessId, ...sessionUser } = await authApi.login(dto);
      setUser(sessionUser);
      await refreshBusinesses();
      setCurrentBusinessId(businessId);
      setStatus('authenticated');
    },
    [refreshBusinesses, setCurrentBusinessId],
  );

  const setup = useCallback(
    async (dto: SetupInput) => {
      const sessionUser = await authApi.setup(dto);
      setUser(sessionUser);
      await refreshBusinesses();
      setStatus('authenticated');
    },
    [refreshBusinesses],
  );

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* 서버 다운 중에도 로컬 상태는 항상 초기화 */ }
    setUser(null);
    setBusinesses([]);
    setCurrentBusinessIdState(null);
    sessionStorage.removeItem(CURRENT_BUSINESS_KEY);
    setStatus('unauthenticated');
  }, []);

  const currentBusiness = useMemo(
    () => businesses.find((b) => b.id === currentBusinessId) ?? null,
    [businesses, currentBusinessId],
  );

  const value: AuthContextValue = {
    status,
    user,
    businesses,
    currentBusinessId,
    currentBusiness,
    setCurrentBusinessId,
    refreshBusinesses,
    login,
    setup,
    logout,
    recheck,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
