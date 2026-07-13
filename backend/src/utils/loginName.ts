export const MAX_LOGIN_NAME_LENGTH = 100;

function isPrintableChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code <= 31 || code === 127) return false; // ASCII control chars + DEL
  return true;
}

/**
 * Trims/collapses whitespace and strips control characters from a login name before it's
 * used in a lookup. Deliberately does NOT case-fold: names are stored/matched case-sensitively
 * today, and lowercasing only the input (not stored data) would lock out existing accounts.
 *
 * Lives apart from utils/auth.ts so modules that only need name normalization (e.g. the login
 * rate limiter and its tests) don't transitively import config.ts, which requires a full env
 * to be present at import time.
 */
export function normalizeLoginName(name: string): string {
  const printable = Array.from(name).filter(isPrintableChar).join('');
  return printable.trim().replace(/\s+/g, ' ').slice(0, MAX_LOGIN_NAME_LENGTH);
}
