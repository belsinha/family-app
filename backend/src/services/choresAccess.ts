import { prisma } from '../db/prisma.js';
import { getChildByUserId } from '../db/queries/children.js';
import type { Role } from '../types.js';

/** Only parents see the full household; `child` and `family` use the self-only chores scope. */
export function hasFullChoresAccess(role: Role): boolean {
  return role === 'parent';
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
