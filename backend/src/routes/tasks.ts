import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { ensureInstancesForDate } from '../services/taskGenerator.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

const instanceInclude = {
  template: {
    include: {
      category: true,
      assignees: { include: { member: true } },
    },
  },
  assignedTo: true,
  allowanceLiabilityMember: true,
} as const;

async function assertChildMemberId(id: number): Promise<boolean> {
  const m = await prisma.householdMember.findUnique({ where: { id } });
  return Boolean(m && !m.canEditChores);
}

router.get('/today', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const userIdParam = req.query.userId as string | undefined;

    await ensureInstancesForDate(date);

    if (hasFullChoresAccess(req.user.role)) {
      const id = userIdParam ? parseInt(userIdParam, 10) : NaN;
      const whereParent =
        !Number.isNaN(id)
          ? {
              taskDate: date,
              OR: [
                { assignedToId: id },
                {
                  assignedToId: null,
                  allowanceLiabilityMemberId: id,
                  template: { anyoneMayComplete: true },
                },
                { assignedToId: null, template: { anyoneMayComplete: true } },
              ],
            }
          : { taskDate: date };

      const instances = await prisma.taskInstance.findMany({
        where: whereParent,
        include: instanceInclude,
        orderBy: [
          { template: { timeBlock: 'asc' } },
          { template: { name: 'asc' } },
        ],
      });
      return res.json(instances);
    }

    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
    if (mid == null) {
      return res.json([]);
    }

    const instances = await prisma.taskInstance.findMany({
      where: {
        taskDate: date,
        OR: [
          { assignedToId: mid },
          { assignedToId: null, template: { anyoneMayComplete: true } },
        ],
      },
      include: instanceInclude,
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

router.get('/excuse-requests/pending', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const list = await prisma.taskInstance.findMany({
      where: { excuseStatus: 'PENDING' },
      include: instanceInclude,
      orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

router.patch('/:instanceId/allowance-liability', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    const liabilityId = Number(req.body?.householdMemberId);
    if (!Number.isInteger(liabilityId)) {
      return res.status(400).json({ error: 'householdMemberId is required' });
    }
    if (!(await assertChildMemberId(liabilityId))) {
      return res.status(400).json({ error: 'householdMemberId must be a child household member' });
    }

    const existing = await prisma.taskInstance.findUnique({
      where: { id: instanceId },
      include: { template: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!existing.template.anyoneMayComplete) {
      return res.status(400).json({ error: 'Allowance liability only applies to anyone-can-do tasks' });
    }
    if (existing.status === 'DONE') {
      return res.status(400).json({ error: 'Task is already completed' });
    }

    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: { allowanceLiabilityMemberId: liabilityId },
      include: instanceInclude,
    });
    res.json(instance);
  } catch (e) {
    next(e);
  }
});

router.post('/:instanceId/excuse-request', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    const noteRaw = req.body?.note;
    const note =
      typeof noteRaw === 'string'
        ? noteRaw.trim().slice(0, 2000)
        : '';
    if (note.length < 3) {
      return res.status(400).json({ error: 'Please enter a note (at least 3 characters) explaining why this chore should not count against allowance.' });
    }

    const existing = await prisma.taskInstance.findUnique({
      where: { id: instanceId },
      include: { template: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'DONE') {
      return res.status(400).json({ error: 'Completed tasks do not need an allowance excuse' });
    }
    if (existing.excuseStatus === 'PENDING') {
      return res.status(400).json({ error: 'An excuse request is already pending for this task' });
    }
    if (existing.excuseStatus === 'APPROVED') {
      return res.status(400).json({ error: 'This task is already excused for allowance' });
    }

    if (!hasFullChoresAccess(req.user.role)) {
      const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
      const pool = existing.template.anyoneMayComplete && existing.assignedToId == null;
      const ok = mid != null && (existing.assignedToId === mid || pool);
      if (!ok) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const requestedAt = new Date().toISOString();
    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: {
        excuseStatus: 'PENDING',
        excuseNote: note,
        excuseRequestedAt: requestedAt,
        excuseDecidedAt: null,
        excuseDeciderUserId: null,
      },
      include: instanceInclude,
    });
    res.json(instance);
  } catch (e) {
    next(e);
  }
});

router.post('/:instanceId/excuse-decision', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const instanceId = parseInt(req.params.instanceId, 10);
    if (Number.isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    const action = req.body?.action;
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'action must be approve or reject' });
    }

    const existing = await prisma.taskInstance.findUnique({
      where: { id: instanceId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.excuseStatus !== 'PENDING') {
      return res.status(400).json({ error: 'No pending excuse request for this task' });
    }

    const decidedAt = new Date().toISOString();
    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: {
        excuseStatus: action === 'approve' ? 'APPROVED' : 'REJECTED',
        excuseDecidedAt: decidedAt,
        excuseDeciderUserId: req.user.userId,
      },
      include: instanceInclude,
    });
    res.json(instance);
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
      include: { template: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
    const poolOpen = existing.template.anyoneMayComplete && existing.assignedToId == null;

    if (!hasFullChoresAccess(req.user.role)) {
      if (mid == null) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (!poolOpen && existing.assignedToId !== mid) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (poolOpen) {
      const bid = Number(req.body?.completedByMemberId);
      if (!Number.isInteger(bid)) {
        return res.status(400).json({
          error: 'For anyone-can-do tasks, send completedByMemberId (child household member id) when marking done.',
        });
      }
      if (!(await assertChildMemberId(bid))) {
        return res.status(400).json({ error: 'completedByMemberId must be a child household member' });
      }
    }

    const doneWithoutReminder = Boolean(req.body?.doneWithoutReminder);

    let completedById: number;
    if (poolOpen) {
      if (hasFullChoresAccess(req.user.role)) {
        completedById = Number(req.body?.completedByMemberId);
      } else {
        completedById = mid!;
      }
    } else {
      completedById = existing.assignedToId!;
    }

    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: {
        status: 'DONE',
        doneAt: new Date().toISOString(),
        doneWithoutReminder,
        assignedToId: completedById,
        allowanceLiabilityMemberId: null,
        excuseStatus: 'NONE',
        excuseNote: null,
        excuseRequestedAt: null,
        excuseDecidedAt: null,
        excuseDeciderUserId: null,
      },
      include: instanceInclude,
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
      include: { template: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
    const poolOpen = existing.template.anyoneMayComplete && existing.assignedToId == null;

    if (!hasFullChoresAccess(req.user.role)) {
      if (mid == null) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (!poolOpen && existing.assignedToId !== mid) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const instance = await prisma.taskInstance.update({
      where: { id: instanceId },
      data: { status: 'MISSED' },
      include: instanceInclude,
    });
    res.json(instance);
  } catch (e) {
    next(e);
  }
});

export default router;
