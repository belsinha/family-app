import { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import ChangePassword from './ChangePassword';

interface LayoutProps {
  children: ReactNode;
}

const parentNavItems = [
  { path: '/', label: 'Children' },
  { path: '/projects', label: 'Projects' },
  { path: '/work-logs/approval', label: 'Work log approvals' },
  { path: '/chores', label: 'Casa Organizada' },
] as const;

export default function Layout({ children }: LayoutProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    closeMobileMenu();
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    closeMobileMenu();
    logout();
    navigate('/login');
  };

  const handlePasswordChangeSuccess = () => {
    setShowChangePassword(false);
    closeMobileMenu();
    alert('Password changed successfully!');
  };

  const go = (path: string) => {
    navigate(path);
    closeMobileMenu();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-[env(safe-area-inset-bottom,0px)]">
      {isAuthenticated && (
        <header className="border-b border-gray-100 bg-white shadow-sm pt-[env(safe-area-inset-top,0px)]">
          <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="min-w-0 text-left text-lg font-bold leading-tight text-gray-900 transition-colors hover:text-blue-800 sm:text-2xl"
              >
                <span className="line-clamp-2 sm:line-clamp-none">Bandeira Family App</span>
              </button>

              <div className="hidden items-center gap-2 sm:gap-4 lg:flex">
                {user?.role !== 'parent' && location.pathname === '/chores' && (
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900"
                  >
                    Home
                  </button>
                )}
                <span className="max-w-[12rem] truncate text-sm text-gray-600" title={`${user?.name} (${user?.role})`}>
                  {user?.name} ({user?.role})
                </span>
                <button
                  type="button"
                  onClick={() => setShowChangePassword(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Logout
                </button>
              </div>

              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-800 hover:bg-gray-50 lg:hidden"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-app-menu"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMobileMenuOpen((o) => !o)}
              >
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>

            {user?.role === 'parent' && (
              <nav className="mt-4 hidden flex-wrap gap-2 border-t border-gray-200 pt-4 lg:flex lg:gap-4">
                {parentNavItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            )}

            {mobileMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                  aria-label="Close menu"
                  onClick={closeMobileMenu}
                />
                <div
                  id="mobile-app-menu"
                  className="fixed inset-y-0 right-0 z-50 flex w-[min(100vw,20rem)] flex-col border-l border-gray-200 bg-white p-4 shadow-xl lg:hidden"
                  style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
                >
                  <div className="mb-4 border-b border-gray-100 pb-3">
                    <p className="font-medium text-gray-900">{user?.name}</p>
                    <p className="text-sm capitalize text-gray-500">{user?.role}</p>
                  </div>

                  {user?.role !== 'parent' && location.pathname === '/chores' && (
                    <button
                      type="button"
                      onClick={() => go('/')}
                      className="rounded-lg px-3 py-3 text-left text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Home
                    </button>
                  )}

                  {user?.role === 'parent' && (
                    <nav className="flex flex-col gap-1 border-b border-gray-100 pb-4">
                      {parentNavItems.map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => go(item.path)}
                          className={`rounded-lg px-3 py-3 text-left text-sm font-medium ${
                            location.pathname === item.path
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </nav>
                  )}

                  <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileMenu();
                        setShowChangePassword(true);
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Change Password
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-lg bg-red-600 px-3 py-3 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>
      )}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-8">
        {showChangePassword ? (
          <ChangePassword
            onSuccess={handlePasswordChangeSuccess}
            onCancel={() => setShowChangePassword(false)}
          />
        ) : (
          children
        )}
      </main>
    </div>
  );
}
