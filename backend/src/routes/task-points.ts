import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { authorizeChildAccess } from '../services/childAccess.js';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { getPointById } from '../db/queries/points.js';
import { getTaskPointRequest, insertTaskPoint, voidTaskPoint } from '../db/queries/task-points.js';
import { parseTaskPointRequest, taskPointFingerprint } from '../services/taskPointRequest.js';

const router = Router();
const enabled: RequestHandler = (_req, res, next) => {
  if (!config.taskPoints.enabled) return res.status(503).json({ error: 'Task point tracking has not been enabled' });
  next();
};

router.post('/task', authenticate, requireRole('parent'), enabled, async (req: AuthRequest, res, next) => {
  try {
    const request = parseTaskPointRequest(req.body);
    if (!request) return res.status(400).json({ error: 'Supply childId, taskInstanceId, positive integer points, bonus/demerit type, reason and UUID requestId' });
    const access = await authorizeChildAccess(req.user!, request.childId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (access.child.house_id !== config.chores.houseId) {
      return res.status(403).json({ error: 'This chores database does not belong to your house' });
    }
    const fingerprint = taskPointFingerprint(request);
    const previous = await getTaskPointRequest(req.user!.userId, request.requestId);
    if (previous) {
      if (previous.request_fingerprint !== fingerprint) return res.status(409).json({ error: 'requestId was already used for different task points' });
      return res.json({ point: previous, replayed: true });
    }
    if (!access.child.chore_member_id) return res.status(409).json({ error: 'Link this child to a household member first' });
    const task = await prisma.taskInstance.findUnique({
      where: { id: request.taskInstanceId }, include: { template: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.assignedToId !== access.child.chore_member_id) {
      return res.status(403).json({ error: 'Task is not assigned to this child’s linked household member' });
    }
    const result = await insertTaskPoint(request, req.user!.userId, access.child.house_id!, {
      taskName: task.template.name, taskDate: task.taskDate,
      householdMemberId: access.child.chore_member_id,
    }, fingerprint);
    if (result.point.request_fingerprint !== fingerprint) return res.status(409).json({ error: 'requestId was already used for different task points' });
    // Deliberately no price fetch, conversion, payout, wallet signing or broadcast.
    return res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.post('/:pointId/void', authenticate, requireRole('parent'), enabled, async (req: AuthRequest, res, next) => {
  try {
    const pointId = Number(req.params.pointId);
    const reason = req.body?.reason;
    if (!Number.isSafeInteger(pointId) || pointId <= 0 || typeof reason !== 'string' ||
        !reason.trim() || reason.trim().length > 2000) return res.status(400).json({ error: 'Valid point ID and reason required' });
    const point = await getPointById(pointId);
    if (!point) return res.status(404).json({ error: 'Point not found' });
    const access = await authorizeChildAccess(req.user!, point.child_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (point.source !== 'task') return res.status(409).json({ error: 'Use the existing undo action for legacy points' });
    return res.json(await voidTaskPoint(point, req.user!.userId, reason.trim()));
  } catch (error) { next(error); }
});

export default router;
