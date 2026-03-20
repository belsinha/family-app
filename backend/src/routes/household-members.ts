import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (hasFullChoresAccess(req.user.role)) {
      const members = await prisma.householdMember.findMany({
        orderBy: { id: 'asc' },
      });
      return res.json(members);
    }
    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId);
    if (mid == null) {
      return res.json([]);
    }
    const member = await prisma.householdMember.findUnique({ where: { id: mid } });
    res.json(member ? [member] : []);
  } catch (e) {
    next(e);
  }
});

export default router;
