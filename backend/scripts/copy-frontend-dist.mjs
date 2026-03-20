/**
 * Copy Vite output into backend/static-frontend so the Node service can serve the SPA
 * even when deploy pipelines omit gitignored paths like frontend/dist/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const src = path.join(repoRoot, 'frontend', 'dist');
const dest = path.join(repoRoot, 'backend', 'static-frontend');
const indexHtml = path.join(src, 'index.html');

if (!fs.existsSync(indexHtml)) {
  console.error('copy-frontend-dist: expected', indexHtml);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('copy-frontend-dist: copied to', dest);
