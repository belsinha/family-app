import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getChildByUserId } from '../db/queries/children.js';
import type { Role } from '../types.js';

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
