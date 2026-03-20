/**
 * Copy Vite output into backend/dist/static-frontend so production always serves
 * the SPA from the same tree as dist/server.js (avoids sibling folders that some
 * deploy pipelines omit or clean).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const src = path.join(repoRoot, 'frontend', 'dist');
const dest = path.resolve(__dirname, '..', 'dist', 'static-frontend');
const indexHtml = path.join(src, 'index.html');

if (!fs.existsSync(indexHtml)) {
  console.error('copy-spa-to-dist: missing:', indexHtml);
  console.error(
    'Build the Vite app first (from repo root: npm run build, or on Render: npm install && npm run build:render — not only cd backend && npm run build).'
  );
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('copy-spa-to-dist: copied SPA to', dest);
