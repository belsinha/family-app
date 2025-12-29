import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, LoginRequest, LoginResponse } from '../../../shared/src/types';

export type LoginStatus = 'idle' | 'waking-up' | 'authenticating' | 'success' | 'error';

interface AuthContextType {
  user: Omit<User, 'password_hash'> | null;
  token: string | null;
  login: (credentials: LoginRequest, onStatusChange?: (status: LoginStatus) => void) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'password_hash'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth data on mount
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (credentials: LoginRequest, onStatusChange?: (status: LoginStatus) => void) => {
    const getApiBaseUrl = () => {
      if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
      }
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      return `${protocol}//${hostname}:3001/api`;
    };

    const RETRY_INTERVAL_MS = 4000; // 4 seconds
    const MAX_WAIT_TIME_MS = 30000; // 30 seconds
    const REQUEST_TIMEOUT_MS = 10000; // 10 seconds per request

    const apiUrl = `${getApiBaseUrl()}/auth/login`;
    const startTime = Date.now();
    let attemptCount = 0;

    const isBackendSleepState = (error: unknown, response?: Response): boolean => {
      // Network errors (connection refused, etc.)
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        return true;
      }
      
      // AbortError (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return true;
      }
      
      // HTTP errors indicating backend unavailable
      if (response && [502, 503, 504].includes(response.status)) {
        return true;
      }

      // Timeout errors
      if (error instanceof Error && error.message.includes('timeout')) {
        return true;
      }

      return false;
    };

    const makeRequest = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(credentials),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    while (true) {
      attemptCount++;
      const elapsedTime = Date.now() - startTime;

      // Check if we've exceeded maximum wait time
      if (elapsedTime >= MAX_WAIT_TIME_MS) {
        onStatusChange?.('error');
        throw new Error('Server is taking too long to respond. Please try again.');
      }

      try {
        // If this is not the first attempt, we're in wake-up state
        if (attemptCount > 1) {
          onStatusChange?.('waking-up');
        } else {
          onStatusChange?.('authenticating');
        }

        const response = await makeRequest();

        // Check for backend sleep state HTTP errors
        if (!response.ok && isBackendSleepState(null, response)) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
          continue;
        }

        // Handle non-sleep-state errors
        if (!response.ok) {
          let errorMessage = 'Login failed';
          try {
            const error = await response.json();
            errorMessage = error.error || error.message || errorMessage;
          } catch {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
          onStatusChange?.('error');
          throw new Error(errorMessage);
        }

        // Success
        const data: LoginResponse = await response.json();
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('authUser', JSON.stringify(data.user));
        onStatusChange?.('success');
        return;
      } catch (error) {
        // Check if this is a backend sleep state error
        if (isBackendSleepState(error)) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
          continue;
        }

        // Non-sleep-state error, throw it
        onStatusChange?.('error');
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('An unexpected error occurred during login');
      }
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user && !!token,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

