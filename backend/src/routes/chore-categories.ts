import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import {
  bootstrapEmptyChoresHousehold,
  hasFullChoresAccess,
  requireChoreEditorOrParent,
} from '../services/choresAccess.js';

const router = Router();

const requireCanEditChores = requireChoreEditorOrParent({
  deniedMessage: 'This user cannot edit categories.',
});

router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (hasFullChoresAccess(req.user.role)) {
      await bootstrapEmptyChoresHousehold();
    }
    const list = await prisma.choreCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, requireCanEditChores, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;
    const created = await prisma.choreCategory.create({
      data: {
        name,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    });
    res.status(201).json(created);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A category with this name already exists' });
    }
    next(e);
  }
});

router.patch('/:id', authenticate, requireCanEditChores, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const body = req.body as Record<string, unknown>;
    const data: { name?: string; sortOrder?: number } = {};
    if (body.name != null) {
      data.name = String(body.name).trim();
      if (!data.name) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
    }
    if (body.sortOrder != null) {
      const n = Number(body.sortOrder);
      if (Number.isFinite(n)) data.sortOrder = n;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const updated = await prisma.choreCategory.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A category with this name already exists' });
    }
    next(e);
  }
});

router.delete('/:id', authenticate, requireCanEditChores, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const count = await prisma.taskTemplate.count({ where: { categoryId: id } });
    if (count > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${count} task template(s) still use this category`,
      });
    }
    await prisma.choreCategory.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
