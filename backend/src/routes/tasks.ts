import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { ensureInstancesForDate } from '../services/taskGenerator.js';

const router = Router();

router.get('/today', async (req, res, next) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const userId = req.query.userId as string | undefined;

    await ensureInstancesForDate(date);

    const where: { taskDate: string; assignedToId?: number } = { taskDate: date };
    if (userId) {
      const id = parseInt(userId, 10);
      if (!Number.isNaN(id)) where.assignedToId = id;
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

router.post('/:instanceId/complete', async (req, res, next) => {
  try {
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
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

router.post('/:instanceId/miss', async (req, res, next) => {
  try {
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
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
