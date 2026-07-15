import { getChildById, getChildByUserId, getChildrenByHouseId } from '../db/queries/children.js';
import { getUserById } from '../db/queries/users.js';
import type { Child, Role } from '../types.js';

export type ChildAccessResult =
  | { ok: true; child: Child }
  | { ok: false; status: number; error: string };

/**
 * Route-level guard for child-scoped records (points, bitcoin, work logs, challenges, payouts).
 *
 * - `child` accounts may only touch the child row linked to their own user id.
 * - `family` accounts never get child-scoped access, even if malformed legacy data links them.
 * - `parent` accounts may touch children in exactly their own house. NULL ownership fails closed.
 */
export async function authorizeChildAccess(
  user: { userId: number; role: Role },
  childIdRaw: string | number
): Promise<ChildAccessResult> {
  const childId = typeof childIdRaw === 'string' ? parseInt(childIdRaw, 10) : childIdRaw;
  if (!Number.isInteger(childId) || childId <= 0) {
    return { ok: false, status: 400, error: 'Invalid child ID' };
  }

  if (user.role === 'family') {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  if (user.role === 'child') {
    const own = await getChildByUserId(user.userId);
    if (!own || own.id !== childId) {
      return { ok: false, status: 403, error: 'Access denied' };
    }
    const persistedUser = await getUserById(user.userId);
    if (
      persistedUser?.house_id == null ||
      own.house_id == null ||
      persistedUser.house_id !== own.house_id
    ) {
      return { ok: false, status: 403, error: 'Access denied' };
    }
    return { ok: true, child: own };
  }

  const child = await getChildById(childId);
  if (!child) {
    return { ok: false, status: 404, error: 'Child not found' };
  }

  const parent = await getUserById(user.userId);
  if (
    parent?.house_id == null ||
    child.house_id == null ||
    parent.house_id !== child.house_id
  ) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  return { ok: true, child };
}

/**
 * Children visible to this user: parents see exactly their own house, children see themselves
 * only when both persisted ownership keys agree, and family accounts see nothing.
 */
export async function listAccessibleChildren(user: {
  userId: number;
  role: Role;
}): Promise<Child[]> {
  if (user.role === 'family') {
    return [];
  }
  if (user.role === 'child') {
    const own = await getChildByUserId(user.userId);
    const persistedUser = await getUserById(user.userId);
    return own &&
      own.house_id != null &&
      persistedUser?.house_id != null &&
      own.house_id === persistedUser.house_id
      ? [own]
      : [];
  }
  const parent = await getUserById(user.userId);
  if (parent?.house_id == null) return [];
  return getChildrenByHouseId(parent.house_id);
}
