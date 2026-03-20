import { PrismaClient } from '@prisma/client';
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

function ensureChoresDatabaseUrl(): void {
  const url = process.env.CHORES_DATABASE_URL || config.choresDatabaseUrl;
  if (!url.startsWith('file:')) {
    process.env.CHORES_DATABASE_URL = url;
    return;
  }
  const absolutePath = sqliteAbsolutePathFromFileUrl(url);
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Prisma/sqlite on Windows rejects file:///... from pathToFileURL; use file:C:/... style.
  const posixPath = absolutePath.split(path.sep).join('/');
  process.env.CHORES_DATABASE_URL = 'file:' + posixPath;
}

ensureChoresDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
