/**
 * CORS origin allowlist, driven by ALLOWED_ORIGINS (comma-separated) and PUBLIC_APP_ORIGIN.
 * Requests with no Origin header (curl, server-to-server, health checks) are always allowed —
 * the browser only sends Origin for cross-origin fetches, so this can't be spoofed by a browser.
 */

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, '');
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((o) => stripTrailingSlash(o.trim()))
        .filter(Boolean)
    )
  );
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  allowLocalhost: boolean
): boolean {
  if (!origin) return true;
  const normalized = stripTrailingSlash(origin);
  if (allowLocalhost && LOCALHOST_ORIGIN_RE.test(normalized)) return true;
  return allowedOrigins.includes(normalized);
}

export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export function createCorsOriginChecker(allowedOrigins: string[], allowLocalhost: boolean) {
  return (origin: string | undefined, callback: CorsOriginCallback) => {
    if (isOriginAllowed(origin, allowedOrigins, allowLocalhost)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    }
  };
}
