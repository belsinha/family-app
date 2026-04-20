import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { buildImportPreview } from '../services/choreImportParse.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const templateInclude = {
  category: true,
  assignees: { include: { member: true } },
} as const satisfies Prisma.TaskTemplateInclude;

type TemplateWithRelations = Prisma.TaskTemplateGetPayload<{ include: typeof templateInclude }>;

function formatTemplate(t: TemplateWithRelations) {
  const first = t.assignees[0]?.member;
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    categoryId: t.categoryId,
    category: t.category,
    frequencyType: t.frequencyType,
    dayOfWeek: t.dayOfWeek,
    weekOfMonth: t.weekOfMonth,
    dayOfMonth: t.dayOfMonth,
    semiannualMonths: t.semiannualMonths,
    conditionalDayOfWeek: t.conditionalDayOfWeek,
    conditionalAfterTime: t.conditionalAfterTime,
    timeBlock: t.timeBlock,
    pointsBase: t.pointsBase,
    active: t.active,
    anyoneMayComplete: t.anyoneMayComplete,
    assignees: t.assignees.map((a) => ({
      householdMemberId: a.householdMemberId,
      member: a.member,
    })),
    assigneeIds: t.assignees.map((a) => a.householdMemberId),
    assignedToId: first?.id ?? t.assignees[0]?.householdMemberId ?? 0,
    assignedTo: first ?? null,
  };
}

async function requireCanEditChores(req: Request, res: Response, next: NextFunction) {
  const editorId = req.headers['x-editor-user-id'] as string | undefined;
  if (!editorId) {
    return res.status(403).json({
      error: 'Only a user with edit permission can change templates. Set X-Editor-User-Id to the household member id.',
    });
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

async function setTemplateAssignees(
  templateId: number,
  memberIds: number[],
  allowEmpty: boolean
): Promise<void> {
  const unique = [...new Set(memberIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (!allowEmpty && unique.length === 0) {
    throw new Error('At least one assignee is required');
  }
  if (unique.length > 0) {
    const members = await prisma.householdMember.findMany({ where: { id: { in: unique } } });
    if (members.length !== unique.length) {
      throw new Error('Invalid household member id in assignee list');
    }
  }
  await prisma.$transaction([
    prisma.taskTemplateAssignee.deleteMany({ where: { templateId } }),
    ...(unique.length > 0
      ? [
          prisma.taskTemplateAssignee.createMany({
            data: unique.map((householdMemberId) => ({ templateId, householdMemberId })),
          }),
        ]
      : []),
  ]);
}

router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (hasFullChoresAccess(req.user.role)) {
      const list = await prisma.taskTemplate.findMany({
        include: templateInclude,
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      });
      return res.json(list.map(formatTemplate));
    }
    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
    if (mid == null) {
      return res.json([]);
    }
    const list = await prisma.taskTemplate.findMany({
      where: {
        OR: [
          { assignees: { some: { householdMemberId: mid } } },
          { anyoneMayComplete: true },
        ],
      },
      include: templateInclude,
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(list.map(formatTemplate));
  } catch (e) {
    next(e);
  }
});

router.post(
  '/import-parse',
  authenticate,
  requireCanEditChores,
  upload.single('file'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Missing file: send multipart field "file".' });
      }
      const categories = await prisma.choreCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      const result = await buildImportPreview({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname || 'upload',
        categories,
      });
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import parse failed';
      return res.status(400).json({ error: msg });
    }
  }
);

router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const t = await prisma.taskTemplate.findUnique({
      where: { id },
      include: templateInclude,
    });
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (!hasFullChoresAccess(req.user.role)) {
      const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
      const allowed =
        t.anyoneMayComplete || t.assignees.some((a) => a.householdMemberId === mid);
      if (mid == null || !allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    res.json(formatTemplate(t));
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, requireCanEditChores, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const categoryId = Number(body.categoryId);
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Number.isInteger(categoryId)) {
      return res.status(400).json({ error: 'categoryId is required' });
    }
    const cat = await prisma.choreCategory.findUnique({ where: { id: categoryId } });
    if (!cat) {
      return res.status(400).json({ error: 'Invalid categoryId' });
    }
    const anyoneMayComplete = body.anyoneMayComplete === true;
    const assigneeIdsRaw = body.assigneeIds ?? body.assignedToId;
    const assigneeIds: number[] = Array.isArray(assigneeIdsRaw)
      ? assigneeIdsRaw.map((x) => Number(x)).filter((n) => Number.isInteger(n))
      : assigneeIdsRaw != null
        ? [Number(assigneeIdsRaw)]
        : [];
    if (!anyoneMayComplete && assigneeIds.length === 0) {
      return res.status(400).json({ error: 'assigneeIds (non-empty array) or assignedToId is required' });
    }

    try {
      const unique = [...new Set(assigneeIds)].filter((n) => Number.isInteger(n) && n > 0);
      if (!anyoneMayComplete) {
        const members = await prisma.householdMember.findMany({ where: { id: { in: unique } } });
        if (members.length !== unique.length) {
          return res.status(400).json({ error: 'Invalid household member id in assignee list' });
        }
      }

      const full = await prisma.$transaction(async (tx) => {
        const t = await tx.taskTemplate.create({
          data: {
            name,
            description:
              body.description !== undefined && body.description !== null && String(body.description).trim()
                ? String(body.description).trim()
                : null,
            categoryId,
            anyoneMayComplete,
            frequencyType: String(body.frequencyType ?? 'DAILY'),
            dayOfWeek: body.dayOfWeek != null ? Number(body.dayOfWeek) : null,
            weekOfMonth: body.weekOfMonth != null ? Number(body.weekOfMonth) : null,
            dayOfMonth: body.dayOfMonth != null ? Number(body.dayOfMonth) : null,
            semiannualMonths:
              body.semiannualMonths != null
                ? Array.isArray(body.semiannualMonths)
                  ? JSON.stringify(body.semiannualMonths)
                  : String(body.semiannualMonths)
                : null,
            conditionalDayOfWeek:
              body.conditionalDayOfWeek != null ? Number(body.conditionalDayOfWeek) : null,
            conditionalAfterTime:
              body.conditionalAfterTime != null ? String(body.conditionalAfterTime) : null,
            timeBlock: String(body.timeBlock ?? 'ANY'),
            pointsBase: Number(body.pointsBase) || 1,
            active: body.active !== false,
          },
        });
        if (unique.length > 0) {
          await tx.taskTemplateAssignee.createMany({
            data: unique.map((householdMemberId) => ({ templateId: t.id, householdMemberId })),
          });
        }
        return tx.taskTemplate.findUniqueOrThrow({
          where: { id: t.id },
          include: templateInclude,
        });
      });
      res.status(201).json(formatTemplate(full));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      return res.status(400).json({ error: msg });
    }
  } catch (e) {
    next(e);
  }
});

router.put('/:id', authenticate, requireCanEditChores, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const body = req.body as Record<string, unknown>;

    if (body.categoryId != null) {
      const cid = Number(body.categoryId);
      if (!Number.isInteger(cid)) {
        return res.status(400).json({ error: 'Invalid categoryId' });
      }
      const cat = await prisma.choreCategory.findUnique({ where: { id: cid } });
      if (!cat) {
        return res.status(400).json({ error: 'Invalid categoryId' });
      }
    }

    const template = await prisma.taskTemplate.update({
      where: { id },
      data: {
        ...(body.name != null && { name: String(body.name).trim() }),
        ...(body.description !== undefined && {
          description:
            body.description == null || String(body.description).trim() === ''
              ? null
              : String(body.description).trim(),
        }),
        ...(body.categoryId != null && { categoryId: Number(body.categoryId) }),
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
        ...(body.anyoneMayComplete !== undefined && {
          anyoneMayComplete: Boolean(body.anyoneMayComplete),
        }),
      },
      include: templateInclude,
    });

    if (body.assigneeIds != null || body.assignedToId != null || body.anyoneMayComplete !== undefined) {
      const anyone = template.anyoneMayComplete;
      const assigneeIdsRaw = body.assigneeIds ?? body.assignedToId;
      const assigneeIds: number[] = Array.isArray(assigneeIdsRaw)
        ? assigneeIdsRaw.map((x) => Number(x)).filter((n) => Number.isInteger(n))
        : assigneeIdsRaw != null
          ? [Number(assigneeIdsRaw)]
          : [];
      try {
        await setTemplateAssignees(id, assigneeIds, anyone);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid assignees';
        return res.status(400).json({ error: msg });
      }
    }

    const full = await prisma.taskTemplate.findUniqueOrThrow({
      where: { id },
      include: templateInclude,
    });
    res.json(formatTemplate(full));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', authenticate, requireCanEditChores, async (req, res, next) => {
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
