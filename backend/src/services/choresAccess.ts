import { prisma } from '../db/prisma.js';
import { getChildByUserId } from '../db/queries/children.js';
import type { Role } from '../types.js';

/** Parents (and other non-child roles) see full household chore data. */
export function hasFullChoresAccess(role: Role): boolean {
  return role !== 'child';
}

/**
 * Map logged-in child user → chores household member id (name match, case-insensitive).
 */
export async function resolveHouseholdMemberIdForChildUser(
  userId: number
): Promise<number | null> {
  const child = await getChildByUserId(userId);
  if (!child) return null;
  const want = child.name.trim().toLowerCase();
  const members = await prisma.householdMember.findMany();
  const m = members.find((x) => x.name.trim().toLowerCase() === want);
  return m?.id ?? null;
}
