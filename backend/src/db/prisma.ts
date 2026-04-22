import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Parse CHORES_DATABASE_URL; relative paths are resolved from the backend package root. */
function sqliteAbsolutePathFromFileUrl(url: string): string {
  const trimmed = url.trim();
  try {
    return path.normalize(fileURLToPath(new URL(trimmed)));
  } catch {
    const rest = trimmed.replace(/^file:/, '').replace(/^\/+/, '');
    return path.isAbsolute(rest)
      ? path.normalize(rest)
      : path.normalize(path.resolve(backendRoot, rest));
  }
}

/**
 * `CHORES_DATABASE_URL=file:/data/chores.db` resolves to host `/data` (not ./data). On Render that
 * is not writable. Remap to backend/data/... so deploys work without creating /data.
 */
function remapMisconfiguredRootDataPath(absolutePath: string): string {
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

function setChoresFileEnv(absolutePath: string): void {
  const posixPath = absolutePath.split(path.sep).join('/');
  process.env.CHORES_DATABASE_URL = 'file:' + posixPath;
}

function ensureChoresDatabaseUrl(): void {
  const url = process.env.CHORES_DATABASE_URL || config.choresDatabaseUrl;
  if (!url.startsWith('file:')) {
    process.env.CHORES_DATABASE_URL = url;
    return;
  }
  let absolutePath = remapMisconfiguredRootDataPath(
    sqliteAbsolutePathFromFileUrl(url),
  );
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // e.g. CHORES_DATABASE_URL=file:/data/chores.db tries to mkdir /data (root); use app dir instead
      if (code === 'EACCES' || code === 'EROFS') {
        absolutePath = path.join(backendRoot, 'data', 'chores.db');
        const fallbackDir = path.dirname(absolutePath);
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        setChoresFileEnv(absolutePath);
        return;
      }
      throw err;
    }
  }
  // Prisma/sqlite on Windows rejects file:///... from pathToFileURL; use file:C:/... style.
  setChoresFileEnv(absolutePath);
}

ensureChoresDatabaseUrl();

/**
 * Apply Prisma migrations before the client touches the DB. The previous shell-only step
 * (`prisma migrate deploy` without `npx`) often failed on PATH and left an empty SQLite file
 * (then "table HouseholdMember does not exist").
 */
function runChoresPrismaMigrateSync(): void {
  if (process.env.CHORES_SKIP_MIGRATE_ON_START === '1') {
    return;
  }
  const url = process.env.CHORES_DATABASE_URL ?? '';
  if (!url.startsWith('file:')) {
    return;
  }
  try {
    console.log('[chores-db] Applying Prisma migrations (migrate deploy)…');
    execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    console.error('[chores-db] prisma migrate deploy failed. Fix migrations or CHORES_DATABASE_URL.');
    throw err;
  }
}

runChoresPrismaMigrateSync();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
