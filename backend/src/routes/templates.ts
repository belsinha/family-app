import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

async function requireCanEditChores(req: Request, res: Response, next: NextFunction) {
  const editorId = req.headers['x-editor-user-id'] as string | undefined;
  if (!editorId) {
    return res.status(403).json({ error: 'Only a user with edit permission can change templates. Set X-Editor-User-Id to the household member id.' });
  }
  const id = parseInt(editorId, 10);
  if (Number.isNaN(id)) {
    return res.status(403).json({ error: 'Invalid X-Editor-User-Id' });
  }
  const member = await prisma.householdMember.findUnique({ where: { id } });
  if (!member?.canEditChores) {
    return res.status(403).json({ error: 'This user cannot edit task templates.' });
  }
  next();
}

router.get('/', async (_req, res, next) => {
  try {
    const list = await prisma.taskTemplate.findMany({
      include: { assignedTo: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const t = await prisma.taskTemplate.findUnique({
      where: { id },
      include: { assignedTo: true },
    });
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireCanEditChores, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const assignedToId = Number(body.assignedToId);
    if (!Number.isInteger(assignedToId)) {
      return res.status(400).json({ error: 'assignedToId required' });
    }
    const template = await prisma.taskTemplate.create({
      data: {
        name: String(body.name ?? ''),
        category: String(body.category ?? ''),
        assignedToId,
        frequencyType: String(body.frequencyType ?? 'DAILY'),
        dayOfWeek: body.dayOfWeek != null ? Number(body.dayOfWeek) : null,
        weekOfMonth: body.weekOfMonth != null ? Number(body.weekOfMonth) : null,
        dayOfMonth: body.dayOfMonth != null ? Number(body.dayOfMonth) : null,
        semiannualMonths:
          body.semiannualMonths != null
            ? (Array.isArray(body.semiannualMonths)
                ? JSON.stringify(body.semiannualMonths)
                : String(body.semiannualMonths))
            : null,
        conditionalDayOfWeek:
          body.conditionalDayOfWeek != null ? Number(body.conditionalDayOfWeek) : null,
        conditionalAfterTime:
          body.conditionalAfterTime != null ? String(body.conditionalAfterTime) : null,
        timeBlock: String(body.timeBlock ?? 'ANY'),
        pointsBase: Number(body.pointsBase) || 1,
        active: body.active !== false,
      },
      include: { assignedTo: true },
    });
    res.status(201).json(template);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', requireCanEditChores, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const body = req.body as Record<string, unknown>;
    const template = await prisma.taskTemplate.update({
      where: { id },
      data: {
        ...(body.name != null && { name: String(body.name) }),
        ...(body.category != null && { category: String(body.category) }),
        ...(body.assignedToId != null && { assignedToId: Number(body.assignedToId) }),
        ...(body.frequencyType != null && { frequencyType: String(body.frequencyType) }),
        ...(body.dayOfWeek !== undefined && {
          dayOfWeek: body.dayOfWeek == null ? null : Number(body.dayOfWeek),
        }),
        ...(body.weekOfMonth !== undefined && {
          weekOfMonth: body.weekOfMonth == null ? null : Number(body.weekOfMonth),
        }),
        ...(body.dayOfMonth !== undefined && {
          dayOfMonth: body.dayOfMonth == null ? null : Number(body.dayOfMonth),
        }),
        ...(body.semiannualMonths !== undefined && {
          semiannualMonths:
            body.semiannualMonths == null
              ? null
              : Array.isArray(body.semiannualMonths)
                ? JSON.stringify(body.semiannualMonths)
                : String(body.semiannualMonths),
        }),
        ...(body.conditionalDayOfWeek !== undefined && {
          conditionalDayOfWeek:
            body.conditionalDayOfWeek == null ? null : Number(body.conditionalDayOfWeek),
        }),
        ...(body.conditionalAfterTime !== undefined && {
          conditionalAfterTime:
            body.conditionalAfterTime == null ? null : String(body.conditionalAfterTime),
        }),
        ...(body.timeBlock != null && { timeBlock: String(body.timeBlock) }),
        ...(body.pointsBase != null && { pointsBase: Number(body.pointsBase) || 1 }),
        ...(body.active !== undefined && { active: Boolean(body.active) }),
      },
      include: { assignedTo: true },
    });
    res.json(template);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireCanEditChores, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    await prisma.taskTemplate.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
