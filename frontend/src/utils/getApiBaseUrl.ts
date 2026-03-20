/**
 * API base URL (includes `/api` path, no trailing slash).
 * If VITE_API_URL is set to the host only (missing `/api`), requests would 404 — normalize that.
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    let base = String(fromEnv).trim().replace(/\/+$/, '');
    if (!base.endsWith('/api')) {
      base = `${base}/api`;
    }
    return base;
  }
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001/api`;
  }
  return `${window.location.origin}/api`;
}
