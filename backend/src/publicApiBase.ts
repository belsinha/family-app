/**
 * Public API base URL (…/api) for the browser when it cannot use same-origin /api
 * (e.g. HTML served from a different host than the API).
 */
export function getPublicApiBaseForClient(): string {
  const explicit = process.env.PUBLIC_API_BASE_URL?.trim();
  if (explicit) {
    let b = explicit.replace(/\/+$/, '');
    if (!b.endsWith('/api')) b = `${b}/api`;
    return b;
  }
  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) {
    return `${render.replace(/\/+$/, '')}/api`;
  }
  return '';
}
