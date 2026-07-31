import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/guide', label: '홈' },
  { to: '/newbiz', label: '신사업 알리미' },
  { to: '/companies', label: '기업 DB' },
  { to: '/workers', label: '근로자 관리' },
  { to: '/mail', label: '메일 관리' },
  { to: '/documents', label: '문서함' },
  { to: '/subsidy', label: '지원금 안내' },
  { to: '/evaluation', label: '평가 대응' },
  { to: '/complaints', label: '민원응대' },
];

export function AppShell() {
  const { user, businesses, currentBusinessId, setCurrentBusinessId, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-title">잡도리 AI</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
          <span className="sidebar-link disabled" title="추후 제공 예정입니다.">
            설정
          </span>
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-left">
            {businesses.length > 0 ? (
              <select
                className="select-input"
                value={currentBusinessId ?? ''}
                onChange={(e) => setCurrentBusinessId(e.target.value)}
                title="현재 사업"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.baseYear})
                  </option>
                ))}
              </select>
            ) : (
              <span className="hint-text">배정된 사업이 없습니다.</span>
            )}
          </div>
          <div className="topbar-right">
            <span className="hint-text">
              {user?.institutionName} · {user?.name} ({user?.role === 'ADMIN' ? '관리자' : '담당자'})
            </span>
            <button className="btn btn-sm" onClick={() => logout()}>
              로그아웃
            </button>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
