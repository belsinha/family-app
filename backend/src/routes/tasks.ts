import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { ensureInstancesForDate } from '../services/taskGenerator.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

router.get('/today', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const userIdParam = req.query.userId as string | undefined;

    await ensureInstancesForDate(date);

    const where: { taskDate: string; assignedToId?: number } = { taskDate: date };

    if (hasFullChoresAccess(req.user.role)) {
      if (userIdParam) {
        const id = parseInt(userIdParam, 10);
        if (!Number.isNaN(id)) where.assignedToId = id;
      }
    } else {
      const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
      if (mid == null) {
        return res.json([]);
      }
      where.assignedToId = mid;
    }

    const instances = await prisma.taskInstance.findMany({
      where,
      include: {
        template: true,
        assignedTo: true,
      },
      orderBy: [
        { template: { timeBlock: 'asc' } },
        { template: { name: 'asc' } },
      ],
    });

    res.json(instances);
  } catch (e) {
    next(e);
  }
});

router.post('/:instanceId/complete', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    const existing = await prisma.taskInstance.findUnique({
      where: { id: instanceId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!hasFullChoresAccess(req.user.role)) {
      const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
      if (mid == null || existing.assignedToId !== mid) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const doneWithoutReminder = Boolean(req.body?.doneWithoutReminder);

    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: {
        status: 'DONE',
        doneAt: new Date().toISOString(),
        doneWithoutReminder,
      },
      include: { template: true, assignedTo: true },
    });
    res.json(instance);
  } catch (e) {
    next(e);
  }
});

router.post('/:instanceId/miss', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    const existing = await prisma.taskInstance.findUnique({
      where: { id: instanceId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!hasFullChoresAccess(req.user.role)) {
      const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
      if (mid == null || existing.assignedToId !== mid) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: { status: 'MISSED' },
      include: { template: true, assignedTo: true },
    });
    res.json(instance);
  } catch (e) {
    next(e);
  }
});

export default router;
