import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { pointsForInstance, classifyWeek } from '../services/scoring.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

const POOL_MEMBER_ID = -1;
const poolMember = { id: POOL_MEMBER_ID, name: 'Anyone (household)', canEditChores: false };

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
      childMemberId = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
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
        ...(childMemberId != null
          ? {
              OR: [
                { assignedToId: childMemberId },
                { assignedToId: null, template: { anyoneMayComplete: true } },
              ],
            }
          : {}),
      },
      include: {
        template: { include: { category: true, assignees: { include: { member: true } } } },
        assignedTo: true,
      },
    });

    const byUser = new Map<
      number,
      {
        member: { id: number; name: string; canEditChores?: boolean };
        totalPoints: number;
        classification: 'green' | 'yellow' | 'red';
        instances: typeof instances;
        missed: typeof instances;
      }
    >();

    for (const inst of instances) {
      if (inst.assignedToId == null && !inst.template.anyoneMayComplete) {
        continue;
      }
      const uid = inst.assignedToId ?? POOL_MEMBER_ID;
      const member = inst.assignedTo ?? poolMember;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          member,
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
