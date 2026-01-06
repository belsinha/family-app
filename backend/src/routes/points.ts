import { Router } from 'express';
import { addPoints, getPointsByChildId, getChildBalance, deletePoint, getMostRecentPoint, getPointsByChildIdLast7Days } from '../db/queries/points.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getChildByUserId } from '../db/queries/children.js';
import { getOrFetchPrice } from '../services/bitcoin.js';
import { createConversion, deleteConversionByPointId } from '../db/queries/bitcoin.js';

const router = Router();

// Constants for conversion
const SATOSHIS_PER_BONUS_POINT = 5_000;
const SATOSHIS_PER_BTC = 100_000_000;

// Add points - only parents can do this
router.post('/', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const { childId, points, type, reason, description, anonymous } = req.body;
    
    if (!childId || points === undefined || !type) {
      return res.status(400).json({ error: 'Missing required fields: childId, points, type' });
    }
    
    // For anonymous points, don't require authentication (but still require parent role)
    const parentId = anonymous ? undefined : req.user?.userId;
    
    // Use description if provided, otherwise fall back to reason for backward compatibility
    const pointRecord = await addPoints(childId, points, type, description || reason, parentId);
    
    // Automatically convert points to Bitcoin (bonus adds, demerit subtracts)
    if (points > 0) {
      try {
        const priceData = await getOrFetchPrice();
        
        if (priceData) {
          // Calculate conversion
          // For bonus: positive satoshis, for demerit: negative satoshis
          const satoshis = type === 'bonus' 
            ? points * SATOSHIS_PER_BONUS_POINT 
            : -(points * SATOSHIS_PER_BONUS_POINT);
          const btcAmount = satoshis / SATOSHIS_PER_BTC;
          const usdValue = btcAmount * priceData.price_usd;
          
          // Create conversion record automatically (linked to the point)
          await createConversion({
            childId,
            pointId: pointRecord.id,
            bonusPointsConverted: type === 'bonus' ? points : -points,
            satoshis,
            btcAmount,
            usdValue,
            priceUsd: priceData.price_usd,
            priceTimestamp: priceData.fetched_at,
            parentId: parentId,
          });
        }
        // If price unavailable, silently continue - point is still added
      } catch (error) {
        // Log error but don't fail the point addition
        console.warn('Failed to auto-convert points to Bitcoin:', error);
      }
    }
    
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
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const points = await getPointsByChildId(childId);
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
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const { bonus, demerit, balance } = await getChildBalance(childId);
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
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const point = await getMostRecentPoint(childId);
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
      const child = await getChildByUserId(req.user.userId);
      if (!child || child.id !== childId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const points = await getPointsByChildIdLast7Days(childId);
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
    
    // Delete the corresponding Bitcoin conversion first (if it exists)
    // This will automatically remove the Bitcoin balance change
    try {
      await deleteConversionByPointId(pointId);
    } catch (error) {
      // Log but don't fail - conversion might not exist (e.g., if price was unavailable when point was added)
      console.warn('Failed to delete Bitcoin conversion for point:', error);
    }
    
    // Now delete the point
    const deleted = await deletePoint(pointId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Point not found' });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;


