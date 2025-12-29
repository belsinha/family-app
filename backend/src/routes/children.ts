import { Router } from 'express';
import { getAllChildren, getChildById, getChildByUserId } from '../db/queries/children.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import type { Role } from '../types.js';

const router = Router();

// Get all children - parents can see all, children can only see themselves
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role === 'parent') {
      const children = await getAllChildren();
      res.json(children);
    } else if (req.user?.role === 'child') {
      const child = await getChildByUserId(req.user.userId);
      res.json(child ? [child] : []);
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  } catch (error) {
    next(error);
  }
});

// Get child by ID - parents can see any, children can only see themselves
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.id, 10);
    const child = await getChildById(childId);
    
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }

    // If child user, only allow access to their own record
    if (req.user?.role === 'child' && child.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(child);
  } catch (error) {
    next(error);
  }
});

export default router;


