import { Router } from 'express';
import { addWorkLog, getWorkLogsByChildId, updateWorkLog, getWorkLogById } from '../db/queries/work-logs.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getChildByUserId } from '../db/queries/children.js';

const router = Router();

// Add work log - children can create for themselves
router.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { childId, hours, description, workDate } = req.body;
    
    if (!childId || hours === undefined || !description) {
      return res.status(400).json({ error: 'Missing required fields: childId, hours, description' });
    }
    
    // Validate hours is positive
    if (typeof hours !== 'number' || hours <= 0) {
      return res.status(400).json({ error: 'Hours must be a positive number' });
    }
    
    // Validate description is not empty
    if (typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'Description cannot be empty' });
    }
    
    // If child user, verify they're creating for themselves
    if (req.user?.role === 'child') {
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied: You can only create work logs for yourself' });
      }
    }
    
    const workLog = await addWorkLog(childId, hours, description, workDate);
    res.status(201).json(workLog);
  } catch (error) {
    next(error);
  }
});

// Get work logs for a child - parents can see any, children can only see their own
router.get('/child/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    
    if (isNaN(childId)) {
      return res.status(400).json({ error: 'Invalid child ID' });
    }
    
    // If child user, verify they're accessing their own data
    if (req.user?.role === 'child') {
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const workLogs = await getWorkLogsByChildId(childId);
    res.json(workLogs);
  } catch (error) {
    next(error);
  }
});

// Update work log - only parents can edit
router.put('/:workLogId', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const workLogId = parseInt(req.params.workLogId, 10);
    const { hours, description, workDate } = req.body;
    
    if (isNaN(workLogId)) {
      return res.status(400).json({ error: 'Invalid work log ID' });
    }
    
    if (hours === undefined || !description) {
      return res.status(400).json({ error: 'Missing required fields: hours, description' });
    }
    
    // Validate hours is positive
    if (typeof hours !== 'number' || hours <= 0) {
      return res.status(400).json({ error: 'Hours must be a positive number' });
    }
    
    // Validate description is not empty
    if (typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'Description cannot be empty' });
    }
    
    // Verify work log exists
    const existingLog = await getWorkLogById(workLogId);
    if (!existingLog) {
      return res.status(404).json({ error: 'Work log not found' });
    }
    
    const updatedLog = await updateWorkLog(workLogId, hours, description, workDate);
    res.json(updatedLog);
  } catch (error) {
    next(error);
  }
});

export default router;

