/**
 * Served as a static file when the SPA is hosted without Express (e.g. Render static site).
 * Express still overrides GET /api-config.js when the API serves the same origin.
 *
 * Set VITE_API_URL at build time to your backend root, e.g. https://family-app-ksog.onrender.com
 * (getApiBaseUrl will append /api). Leave this empty so the build-time env is used.
 */
window.__FAMILY_APP_API_BASE__ = '';
