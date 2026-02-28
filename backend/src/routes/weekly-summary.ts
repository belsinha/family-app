import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { pointsForInstance, classifyWeek } from '../services/scoring.js';

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

router.get('/', async (req, res, next) => {
  try {
    const weekStartParam = req.query.weekStart as string;
    if (!weekStartParam) {
      return res.status(400).json({ error: 'weekStart (YYYY-MM-DD) required' });
    }
    const { start, end } = getWeekBounds(weekStartParam);

    const instances = await prisma.taskInstance.findMany({
      where: {
        taskDate: { gte: start, lte: end },
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
