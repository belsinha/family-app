import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { authorizeChildAccess, listAccessibleChildren } from '../services/childAccess.js';

const router = Router();

// Get all children - parents see their own house, children only themselves
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role === 'parent' || req.user?.role === 'child') {
      const children = await listAccessibleChildren(req.user);
      res.json(children);
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  } catch (error) {
    next(error);
  }
});

// Get child by ID - parents see own-house children, children only themselves
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const access = await authorizeChildAccess(req.user!, req.params.id);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    res.json(access.child);
  } catch (error) {
    next(error);
  }
});

export default router;
