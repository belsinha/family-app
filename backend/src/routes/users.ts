import { Router } from 'express';
import { getUserById, getUsersByHouseId } from '../db/queries/users.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// List users (names, roles, house ids) — parents only, scoped to their own house; was
// previously unauthenticated. Unassigned rows fail closed instead of leaking across houses.
router.get('/', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const me = await getUserById(req.user!.userId);
    if (me?.house_id == null) return res.json([]);
    res.json(await getUsersByHouseId(me.house_id));
  } catch (error) {
    next(error);
  }
});

// Get one user — self always; parents may also fetch users of their own house.
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const isSelf = req.user?.userId === id;
    if (req.user?.role !== 'parent' && !isSelf) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!isSelf) {
      const me = await getUserById(req.user!.userId);
      if (
        me?.house_id == null ||
        user.house_id == null ||
        me.house_id !== user.house_id
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
