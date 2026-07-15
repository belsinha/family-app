import { getUserById } from '../db/queries/users.js';
import type { Role } from '../types.js';

export type HouseAccessResult =
  | { ok: true; houseId: number }
  | { ok: false; status: 403; error: string };

/** Resolve the persisted tenant for a signed-in account and fail closed when unassigned. */
export async function authorizeHouseAccess(user: {
  userId: number;
  role: Role;
}): Promise<HouseAccessResult> {
  const persistedUser = await getUserById(user.userId);
  if (!persistedUser || persistedUser.house_id == null) {
    return { ok: false, status: 403, error: 'Account is not assigned to a house' };
  }

  return { ok: true, houseId: persistedUser.house_id };
}
