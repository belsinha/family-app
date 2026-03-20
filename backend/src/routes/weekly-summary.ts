import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { pointsForInstance, classifyWeek } from '../services/scoring.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

function getWeekBounds(weekStart: string): { start: string; end: string } {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const weekStartParam = req.query.weekStart as string;
    if (!weekStartParam) {
      return res.status(400).json({ error: 'weekStart (YYYY-MM-DD) required' });
    }
    const { start, end } = getWeekBounds(weekStartParam);

    let childMemberId: number | null = null;
    if (!hasFullChoresAccess(req.user.role)) {
      childMemberId = await resolveHouseholdMemberIdForChildUser(req.user.userId);
      if (childMemberId == null) {
        return res.json({
          weekStart: start,
          weekEnd: end,
          byUser: [],
        });
      }
    }

    const instances = await prisma.taskInstance.findMany({
      where: {
        taskDate: { gte: start, lte: end },
        ...(childMemberId != null ? { assignedToId: childMemberId } : {}),
      },
      include: { template: true, assignedTo: true },
    });

    const byUser = new Map<
      number,
      {
        member: { id: number; name: string };
        totalPoints: number;
        classification: 'green' | 'yellow' | 'red';
        instances: typeof instances;
        missed: typeof instances;
      }
    >();

    for (const inst of instances) {
      const uid = inst.assignedToId;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          member: inst.assignedTo,
          totalPoints: 0,
          classification: 'red',
          instances: [],
          missed: [],
        });
      }
      const row = byUser.get(uid)!;
      row.instances.push(inst);
      if (inst.status === 'MISSED') row.missed.push(inst);
      row.totalPoints += pointsForInstance(inst);
    }

    const summary = Array.from(byUser.values()).map((row) => ({
      ...row,
      classification: classifyWeek(row.totalPoints),
    }));

    res.json({
      weekStart: start,
      weekEnd: end,
      byUser: summary,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
