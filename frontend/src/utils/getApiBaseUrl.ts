declare global {
  interface Window {
    __FAMILY_APP_API_BASE__?: string;
  }
}

function normalizeApiRoot(input: string): string {
  let base = input.trim().replace(/\/+$/, '');
  if (!base.endsWith('/api')) {
    base = `${base}/api`;
  }
  return base;
}

/**
 * API base URL (includes `/api`, no trailing slash).
 * Order: dev server → runtime injection from backend (/api-config.js) → Vite env → same origin.
 */
export function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001/api`;
  }

  const injected = window.__FAMILY_APP_API_BASE__;
  if (typeof injected === 'string' && injected.trim() !== '') {
    return normalizeApiRoot(injected);
  }

  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    return normalizeApiRoot(String(fromEnv));
  }

  return `${window.location.origin}/api`;
}
