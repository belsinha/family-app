/**
 * Sets CHORES_DATABASE_URL to an absolute file: URL (backend/data/chores.db by default)
 * so Prisma CLI matches runtime. Prisma resolves relative file: URLs against prisma/, not backend/.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(backendRoot, '.env') });
} catch {
  /* optional */
}

/** Same rule as src/db/prisma.ts — file:/data/... is not writable on Render. */
function remapMisconfiguredRootDataPath(absolutePath) {
  if (process.platform === 'win32') {
    return absolutePath;
  }
  const normalized = absolutePath.replace(/\\/g, '/');
  if (normalized === '/data' || normalized.startsWith('/data/')) {
    const underData =
      normalized === '/data'
        ? 'chores.db'
        : normalized.slice('/data/'.length) || 'chores.db';
    return path.normalize(path.join(backendRoot, 'data', underData));
  }
  return absolutePath;
}

function normalizeChoresDatabaseUrl() {
  let url = process.env.CHORES_DATABASE_URL || 'file:./data/chores.db';
  if (!url.startsWith('file:')) {
    return;
  }
  const trimmed = url.trim();
  let abs;
  try {
    abs = path.normalize(fileURLToPath(new URL(trimmed)));
  } catch {
    const rest = trimmed.replace(/^file:/, '').replace(/^\/+/, '');
    abs = path.isAbsolute(rest)
      ? path.normalize(rest)
      : path.normalize(path.resolve(backendRoot, rest));
  }
  abs = remapMisconfiguredRootDataPath(abs);
  process.env.CHORES_DATABASE_URL = 'file:' + abs.split(path.sep).join('/');
}

normalizeChoresDatabaseUrl();

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: with-chores-db-url.mjs <command> [args...]');
  process.exit(1);
}

const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  cwd: backendRoot,
  env: process.env,
  shell: true,
});
process.exit(result.status ?? 1);
