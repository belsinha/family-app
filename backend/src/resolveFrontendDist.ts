import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Find Vite `dist` when cwd may be repo root or `backend/` (e.g. Render: `cd backend && npm start`).
 */
export function resolveFrontendIndex(): { dist: string; index: string } | null {
  const cwd = process.cwd();
  const dirname = path.dirname(fileURLToPath(import.meta.url));

  const candidates: string[] = [];

  const env = process.env.FRONTEND_DIST?.trim();
  if (env) {
    candidates.push(path.isAbsolute(env) ? env : path.resolve(cwd, env));
  }

  // Production: copy-spa-to-dist.mjs (backend build) places assets next to dist/*.js
  candidates.push(path.join(dirname, 'static-frontend'));

  // Fallback: sibling folder (manual deploy layout)
  candidates.push(path.resolve(dirname, '../static-frontend'));

  candidates.push(
    path.resolve(dirname, '../../frontend/dist'),
    path.resolve(cwd, '../frontend/dist'),
    path.resolve(cwd, 'frontend/dist')
  );

  const seen = new Set<string>();
  for (const dist of candidates) {
    if (seen.has(dist)) continue;
    seen.add(dist);
    const index = path.join(dist, 'index.html');
    if (fs.existsSync(index)) {
      return { dist, index };
    }
  }

  return null;
}

export function formatFrontendSearchList(): string {
  const cwd = process.cwd();
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const env = process.env.FRONTEND_DIST?.trim();
  const extra = env
    ? [path.isAbsolute(env) ? env : path.resolve(cwd, env)]
    : [];
  const all = [
    ...extra,
    path.join(dirname, 'static-frontend'),
    path.resolve(dirname, '../static-frontend'),
    path.resolve(dirname, '../../frontend/dist'),
    path.resolve(cwd, '../frontend/dist'),
    path.resolve(cwd, 'frontend/dist'),
  ];
  return [...new Set(all)].map((p) => `  - ${p}`).join('\n');
}
