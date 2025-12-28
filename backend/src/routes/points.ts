import { Router } from 'express';
import { addPoints, getPointsByChildId, getChildBalance, deletePoint, getMostRecentPoint, getPointsByChildIdLast7Days } from '../db/queries/points.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getChildByUserId } from '../db/queries/children.js';

const router = Router();

// Add points - only parents can do this
router.post('/', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const { childId, points, type, reason, description, anonymous } = req.body;
    
    if (!childId || points === undefined || !type) {
      return res.status(400).json({ error: 'Missing required fields: childId, points, type' });
    }
    
    // For anonymous points, don't require authentication (but still require parent role)
    const parentId = anonymous ? null : req.user?.userId || null;
    
    // Use description if provided, otherwise fall back to reason for backward compatibility
    const pointRecord = addPoints(childId, points, type, description || reason, parentId);
    res.status(201).json(pointRecord);
  } catch (error) {
    next(error);
  }
});

// Get points for a child - parents can see any, children can only see their own
router.get('/child/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    
    // If child user, verify they're accessing their own data
    if (req.user?.role === 'child') {
      const child = getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const points = getPointsByChildId(childId);
    res.json(points);
  } catch (error) {
    next(error);
  }
});

// Get balance for a child - parents can see any, children can only see their own
router.get('/child/:childId/balance', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    
    // If child user, verify they're accessing their own data
    if (req.user?.role === 'child') {
      const child = getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const { bonus, demerit, balance } = getChildBalance(childId);
    res.json({ childId, bonus, demerit, balance });
  } catch (error) {
    next(error);
  }
});

// Get most recent point - parents can see any, children can only see their own
router.get('/child/:childId/most-recent', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    
    // If child user, verify they're accessing their own data
    if (req.user?.role === 'child') {
      const child = getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const point = getMostRecentPoint(childId);
    if (!point) {
      return res.status(404).json({ error: 'No points found' });
    }
    res.json(point);
  } catch (error) {
    next(error);
  }
});

// Get points for a child from last 7 days - parents can see any, children can only see their own
router.get('/child/:childId/last-7-days', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    
    // If child user, verify they're accessing their own data
    if (req.user?.role === 'child') {
      const child = getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const points = getPointsByChildIdLast7Days(childId);
    res.json(points);
  } catch (error) {
    next(error);
  }
});

// Delete point - only parents can do this
router.delete('/:pointId', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const pointId = parseInt(req.params.pointId, 10);
    
    if (!pointId || isNaN(pointId)) {
      return res.status(400).json({ error: 'Invalid point ID' });
    }
    
    const deleted = deletePoint(pointId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Point not found' });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;


