import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ChangePassword from './ChangePassword';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handlePasswordChangeSuccess = () => {
    setShowChangePassword(false);
    alert('Password changed successfully!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated && (
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold text-gray-900">Bandeira Family App</h1>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {user?.name} ({user?.role})
                </span>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Logout
                </button>
              </div>
            </div>
            {user?.role === 'parent' && (
              <nav className="flex gap-4 border-t border-gray-200 pt-4">
                <button
                  onClick={() => navigate('/')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Children
                </button>
                <button
                  onClick={() => navigate('/projects')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Projects
                </button>
                <button
                  onClick={() => navigate('/work-logs/approval')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors relative"
                >
                  Work Log Approvals
                </button>
              </nav>
            )}
          </div>
        </header>
      )}
      <main className="max-w-7xl mx-auto px-4 py-8">
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


