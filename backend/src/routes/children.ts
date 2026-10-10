import { Router } from 'express';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { authorizeChildAccess, listAccessibleChildren } from '../services/childAccess.js';
import { getSupabaseClient } from '../db/supabase.js';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { positiveId } from '../services/taskPointRequest.js';

const router = Router();

// A parent explicitly links the two databases. IDs and display names are never inferred.
router.put('/:id/chore-member', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    if (!config.taskPoints.enabled) return res.status(503).json({ error: 'Task point tracking has not been enabled' });
    const id = Number(req.params.id);
    const memberId = req.body?.householdMemberId;
    if (!positiveId(id) || !positiveId(memberId)) return res.status(400).json({ error: 'Valid child and household member IDs required' });
    const access = await authorizeChildAccess(req.user!, id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (access.child.house_id !== config.chores.houseId) return res.status(403).json({ error: 'This chores database does not belong to your house' });
    const member = await prisma.householdMember.findUnique({ where: { id: memberId } });
    if (!member) return res.status(404).json({ error: 'Household member not found' });
    const { data, error } = await getSupabaseClient().from('children')
      .update({ chore_member_id: memberId }).eq('id', id).eq('house_id', access.child.house_id).select('*').single();
    if (error?.code === '23505') return res.status(409).json({ error: 'This household member is already linked to another child' });
    if (error) throw new Error('Could not link household member');
    res.json(data);
  } catch (error) { next(error); }
});

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
