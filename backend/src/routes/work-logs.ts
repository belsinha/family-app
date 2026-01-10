import { Router } from 'express';
import {
  addWorkLog,
  getWorkLogsByChildId,
  updateWorkLog,
  getWorkLogById,
  getPendingWorkLogs,
  updateWorkLogStatus,
} from '../db/queries/work-logs.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getChildByUserId } from '../db/queries/children.js';
import { getProjectById } from '../db/queries/projects.js';
import { addPoints } from '../db/queries/points.js';
import { getOrFetchPrice } from '../services/bitcoin.js';
import { createConversion } from '../db/queries/bitcoin.js';

const router = Router();

// Constants for Bitcoin conversion (matching points.ts)
const SATOSHIS_PER_BONUS_POINT = 2_500;
const SATOSHIS_PER_BTC = 100_000_000;

// Add work log - children can create for themselves
router.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { childId, projectId, hours, description, workDate } = req.body;
    
    if (!childId || !projectId || hours === undefined || !description) {
      return res.status(400).json({ error: 'Missing required fields: childId, projectId, hours, description' });
    }
    
    // Validate hours is positive
    if (typeof hours !== 'number' || hours <= 0) {
      return res.status(400).json({ error: 'Hours must be a positive number' });
    }
    
    // Validate description is not empty
    if (typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'Description cannot be empty' });
    }
    
    // Verify project exists and is active
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (project.status !== 'active') {
      return res.status(400).json({ error: 'Cannot log hours for inactive project' });
    }
    
    // Check project dates
    const today = new Date().toISOString().split('T')[0];
    if (project.start_date > today) {
      return res.status(400).json({ error: 'Project has not started yet' });
    }
    
    if (project.end_date && project.end_date < today) {
      return res.status(400).json({ error: 'Project has ended' });
    }
    
    // If child user, verify they're creating for themselves
    if (req.user?.role === 'child') {
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied: You can only create work logs for yourself' });
      }
    }
    
    const workLog = await addWorkLog(childId, projectId, hours, description, workDate);
    res.status(201).json(workLog);
  } catch (error) {
    console.error('Error creating work log:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
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

// Update work log - only parents can edit (only if status is pending)
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
    
    // Verify work log exists and can be edited
    const existingLog = await getWorkLogById(workLogId);
    if (!existingLog) {
      return res.status(404).json({ error: 'Work log not found' });
    }
    
    if (existingLog.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot edit work log that has been approved or declined' });
    }
    
    const updatedLog = await updateWorkLog(workLogId, hours, description, workDate);
    res.json(updatedLog);
  } catch (error) {
    next(error);
  }
});

// Get pending work logs (parents only)
router.get('/pending', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const pendingLogs = await getPendingWorkLogs();
    res.json(pendingLogs);
  } catch (error) {
    next(error);
  }
});

// Approve or decline work log (parents only)
router.post('/:workLogId/approve', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const workLogId = parseInt(req.params.workLogId, 10);
    const { action } = req.body;
    
    if (isNaN(workLogId)) {
      return res.status(400).json({ error: 'Invalid work log ID' });
    }
    
    if (!action || (action !== 'approve' && action !== 'decline')) {
      return res.status(400).json({ error: 'Action must be either "approve" or "decline"' });
    }
    
    // Get the work log
    const workLog = await getWorkLogById(workLogId);
    if (!workLog) {
      return res.status(404).json({ error: 'Work log not found' });
    }
    
    if (workLog.status !== 'pending') {
      return res.status(400).json({ error: `Work log is already ${workLog.status}` });
    }
    
    // Get project to calculate bonus
    if (!workLog.project) {
      const project = await getProjectById(workLog.project_id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      workLog.project = project;
    }
    
    // Convert action to status: 'approve' -> 'approved', 'decline' -> 'declined'
    const status = action === 'approve' ? 'approved' : 'declined';
    
    // Update status
    const updatedLog = await updateWorkLogStatus(workLogId, status);
    
    // If approved, calculate and award bonus
    if (action === 'approve') {
      const bonusPoints = Math.floor(workLog.hours * workLog.project.bonus_rate);
      
      if (bonusPoints > 0) {
        // Award bonus points
        const pointRecord = await addPoints(
          workLog.child_id,
          bonusPoints,
          'bonus',
          `Work log bonus for "${workLog.project.name}": ${workLog.hours} hours × ${workLog.project.bonus_rate} rate`,
          req.user?.userId
        );
        
        // Automatically convert bonus points to Bitcoin (same logic as points route)
        try {
          console.log(`[BITCOIN] Attempting to get Bitcoin price for work log bonus conversion...`);
          const priceData = await getOrFetchPrice();
          
          if (!priceData) {
            console.warn(`❌ Bitcoin price unavailable when approving work log for child ${workLog.child_id}. Bonus points added but not converted.`);
          } else {
            console.log(`[BITCOIN] Price obtained: $${priceData.price_usd} (fetched at: ${priceData.fetched_at.toISOString()})`);
            
            // Calculate conversion for bonus points
            const satoshis = bonusPoints * SATOSHIS_PER_BONUS_POINT;
            const btcAmount = satoshis / SATOSHIS_PER_BTC;
            const usdValue = btcAmount * priceData.price_usd;
            
            console.log(`[BITCOIN] Converting work log bonus: ${bonusPoints} points = ${satoshis} satoshis (${btcAmount} BTC = $${usdValue.toFixed(2)})`);
            
            // Ensure pointId is valid
            if (!pointRecord || !pointRecord.id) {
              throw new Error(`Cannot create conversion: pointRecord is invalid. Point record: ${JSON.stringify(pointRecord)}`);
            }
            
            const pointIdForConversion = Number(pointRecord.id);
            if (!pointIdForConversion || isNaN(pointIdForConversion) || pointIdForConversion <= 0) {
              throw new Error(`Invalid point ID for conversion: ${pointRecord.id} (converted to ${pointIdForConversion})`);
            }
            
            console.log(`[BITCOIN] Creating conversion with pointId: ${pointIdForConversion}`);
            
            // Create conversion record automatically (linked to the point)
            const conversionResult = await createConversion({
              childId: workLog.child_id,
              pointId: pointIdForConversion,
              bonusPointsConverted: bonusPoints,
              satoshis,
              btcAmount,
              usdValue,
              priceUsd: priceData.price_usd,
              priceTimestamp: priceData.fetched_at,
              parentId: req.user?.userId,
            });
            
            console.log(`✓ [BITCOIN] Successfully created work log bonus conversion:`, {
              conversion_id: conversionResult.id,
              point_id: conversionResult.point_id,
              child_id: conversionResult.child_id,
              satoshis: conversionResult.satoshis
            });
          }
        } catch (error) {
          // Log error but don't fail the approval if conversion fails
          console.error(`❌ FAILED to auto-convert work log bonus points to Bitcoin for child ${workLog.child_id}:`, error);
          if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
          }
          // Don't throw - allow approval to succeed even if conversion fails
        }
      }
    }
    
    // Fetch the updated log with project info
    const finalLog = await getWorkLogById(workLogId);
    res.json(finalLog);
  } catch (error) {
    next(error);
  }
});

export default router;

