import type { NextFunction, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getChildByUserId } from '../db/queries/children.js';
import type { Role } from '../types.js';
import type { AuthRequest } from '../middleware/auth.js';

/** Only parents see the full household; `child` and `family` use the self-only chores scope. */
export function hasFullChoresAccess(role: Role): boolean {
  return role === 'parent';
}

/**
 * If no one can edit templates (legacy DB or migrations not applied on this file),
 * grant `canEditChores` to known parents by name, then to whoever matches the logged-in parent's display name.
 * Idempotent; safe to run on every parent list fetch.
 */
export async function ensureChoreTemplateEditorRole(opts?: {
  parentLoginName?: string | null;
}): Promise<void> {
  const hasEditor = async () =>
    (await prisma.householdMember.findFirst({ where: { canEditChores: true } })) != null;
  if (await hasEditor()) return;

  await prisma.$executeRawUnsafe(
    `UPDATE HouseholdMember SET canEditChores = 1 WHERE lower(trim(name)) IN ('celiane', 'rommel')`
  );
  if (await hasEditor()) return;

  const login = opts?.parentLoginName?.trim().toLowerCase();
  if (login) {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE HouseholdMember SET canEditChores = 1 WHERE lower(trim(name)) = ${login}`
    );
  }
}

/** Default household rows when the chores DB was migrated but never seeded (e.g. new Render disk). */
const DEFAULT_CHORES_MEMBERS: { name: string; canEditChores: boolean }[] = [
  { name: 'Celiane', canEditChores: true },
  { name: 'Isabel', canEditChores: false },
  { name: 'Nicholas', canEditChores: false },
  { name: 'Laura', canEditChores: false },
];

/**
 * Ensures at least one category and the canonical household members exist.
 * Safe to call on every parent read of members/categories/templates; no-ops when data is present.
 */
export async function bootstrapEmptyChoresHousehold(): Promise<void> {
  const memberCount = await prisma.householdMember.count();
  if (memberCount === 0) {
    await prisma.householdMember.createMany({ data: DEFAULT_CHORES_MEMBERS });
  }
  const catCount = await prisma.choreCategory.count();
  if (catCount === 0) {
    await prisma.choreCategory.create({
      data: { name: 'General', sortOrder: 0 },
    });
  }
}

/**
 * Template/category writes require `X-Editor-User-Id` = a household member id.
 * Members with `canEditChores` always pass. **Parents** (full chores access) also pass with any
 * valid member id so the UI is not blocked when flags were never set on this database file.
 */
export function requireChoreEditorOrParent(opts?: { deniedMessage: string }) {
  const deniedMessage =
    opts?.deniedMessage ?? 'This user cannot edit task templates.';

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const editorId = req.headers['x-editor-user-id'] as string | undefined;
    if (!editorId) {
      res.status(403).json({
        error:
          'Set X-Editor-User-Id to a household member id (the person acting as editor for this change).',
      });
      return;
    }
    const id = parseInt(editorId, 10);
    if (Number.isNaN(id)) {
      res.status(403).json({ error: 'Invalid X-Editor-User-Id' });
      return;
    }
    const member = await prisma.householdMember.findUnique({ where: { id } });
    if (!member) {
      res.status(403).json({ error: 'Invalid X-Editor-User-Id' });
      return;
    }
    if (member.canEditChores || hasFullChoresAccess(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: deniedMessage });
  };
}

/**
 * Map logged-in non-parent → chores household member id (name match, case-insensitive).
 * Prefer JWT login name, then `children.name` (they can differ in Supabase).
 */
export async function resolveHouseholdMemberIdForChildUser(
  userId: number,
  loginName: string
): Promise<number | null> {
  const child = await getChildByUserId(userId);
  const candidates = [loginName, child?.name]
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.trim().toLowerCase());

  const seen = new Set<string>();
  const members = await prisma.householdMember.findMany();

  for (const want of candidates) {
    if (seen.has(want)) continue;
    seen.add(want);
    const m = members.find((x) => x.name.trim().toLowerCase() === want);
    if (m) return m.id;
  }
  return null;
}
