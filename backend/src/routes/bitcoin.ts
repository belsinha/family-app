import { Router } from 'express';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getCachedPrice, getOrFetchPrice, refreshPriceCache } from '../services/bitcoin.js';
import { createConversion, getConversionsByChildId } from '../db/queries/bitcoin.js';
import { getChildBalance } from '../db/queries/points.js';
import { getChildByUserId } from '../db/queries/children.js';
import { cleanupOrphanedConversions } from '../db/migrate-bitcoin-tables.js';
import type { ConvertBonusRequest, ConvertBonusResponse } from '../types.js';

const router = Router();

// Constants for conversion
const SATOSHIS_PER_BONUS_POINT = 2_500;
const SATOSHIS_PER_BTC = 100_000_000;

/**
 * GET /api/bitcoin/price
 * Get current cached Bitcoin price (all authenticated users can view)
 * Automatically refreshes if price is older than 15 minutes
 */
router.get('/price', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // Try to get cached price first
    let price = await getCachedPrice();
    
    // Check if price is stale (older than 15 minutes) or doesn't exist
    let shouldRefresh = false;
    if (!price) {
      shouldRefresh = true;
    } else {
      const fetchedAt = new Date(price.fetched_at);
      const now = new Date();
      const minutesSinceFetch = (now.getTime() - fetchedAt.getTime()) / (1000 * 60);
      // Refresh if price is older than 15 minutes
      if (minutesSinceFetch > 15) {
        shouldRefresh = true;
      }
    }
    
    // If price is stale or missing, try to fetch a fresh one
    if (shouldRefresh) {
      try {
        const priceData = await getOrFetchPrice();
        if (priceData) {
          // Get the newly cached price
          price = await getCachedPrice();
        }
      } catch (error) {
        // If fetch fails, log it but continue with cached price if available
        console.warn('Failed to refresh Bitcoin price in /price endpoint:', error);
      }
    }
    
    if (!price) {
      return res.status(404).json({ error: 'Bitcoin price not available' });
    }
    
    res.json({
      price_usd: Number(price.price_usd),
      fetched_at: price.fetched_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bitcoin/price/refresh
 * Manually refresh Bitcoin price (parents only)
 */
router.get('/price/refresh', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    console.log('Manual Bitcoin price refresh requested by user:', req.user?.userId);
    const priceData = await refreshPriceCache();
    console.log('Bitcoin price refresh successful:', {
      price_usd: priceData.price_usd,
      fetched_at: priceData.fetched_at.toISOString(),
    });
    
    res.json({
      price_usd: priceData.price_usd,
      fetched_at: priceData.fetched_at.toISOString(),
    });
  } catch (error) {
    console.error('Error refreshing Bitcoin price:', error);
    next(error);
  }
});

/**
 * POST /api/bitcoin/convert
 * Convert bonus points to Bitcoin (parents only)
 */
router.post('/convert', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const { childId, bonusPoints }: ConvertBonusRequest = req.body;
    
    if (!childId || bonusPoints === undefined) {
      return res.status(400).json({ error: 'Missing required fields: childId, bonusPoints' });
    }
    
    if (bonusPoints <= 0) {
      return res.status(400).json({ error: 'Bonus points must be greater than 0' });
    }
    
    // Check child has sufficient bonus points
    const balance = await getChildBalance(childId);
    if (balance.bonus < bonusPoints) {
      return res.status(400).json({ 
        error: `Insufficient bonus points. Child has ${balance.bonus}, requested ${bonusPoints}` 
      });
    }
    
    // Get or fetch Bitcoin price
    const priceData = await getOrFetchPrice();
    
    if (!priceData) {
      return res.status(503).json({ 
        error: 'Bitcoin price unavailable. Conversion disabled.' 
      });
    }
    
    // Calculate conversion
    const satoshis = bonusPoints * SATOSHIS_PER_BONUS_POINT;
    const btcAmount = satoshis / SATOSHIS_PER_BTC;
    const usdValue = btcAmount * priceData.price_usd;
    
    // Create conversion record
    const conversion = await createConversion({
      childId,
      bonusPointsConverted: bonusPoints,
      satoshis,
      btcAmount,
      usdValue,
      priceUsd: priceData.price_usd,
      priceTimestamp: priceData.fetched_at,
      parentId: req.user?.userId,
    });
    
    const response: ConvertBonusResponse = {
      conversion,
      bonusPointsConverted: bonusPoints,
      satoshis,
      btcAmount,
      usdValue,
      priceUsd: priceData.price_usd,
      priceTimestamp: priceData.fetched_at.toISOString(),
    };
    
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bitcoin/conversions/:childId
 * Get conversion history for a child
 * Parents can see any child, children can only see their own
 */
router.get('/conversions/:childId', authenticate, async (req: AuthRequest, res, next) => {
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
    
    const conversions = await getConversionsByChildId(childId);
    res.json(conversions);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bitcoin/balance/:childId
 * Get child's Bitcoin balance with current USD value
 * Parents can see any child, children can only see their own
 */
router.get('/balance/:childId', authenticate, async (req: AuthRequest, res, next) => {
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
    
    // Get current point balance for the child
    const balance = await getChildBalance(childId);
    
    // Calculate Bitcoin balance based on CURRENT points (not historical conversions)
    // Net bonus points = bonus - demerit
    const netBonusPoints = balance.bonus - balance.demerit;
    const totalSatoshis = netBonusPoints * SATOSHIS_PER_BONUS_POINT;
    const totalBtc = totalSatoshis / SATOSHIS_PER_BTC;
    
    // Get current Bitcoin price
    const priceData = await getOrFetchPrice();
    
    if (!priceData) {
      return res.status(503).json({ 
        error: 'Bitcoin price unavailable' 
      });
    }
    
    // Calculate current USD value
    const currentUsdValue = totalBtc * priceData.price_usd;
    
    res.json({
      childId,
      totalSatoshis,
      totalBtc,
      currentUsdValue,
      priceUsd: priceData.price_usd,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bitcoin/cleanup-orphaned
 * Manually trigger cleanup of orphaned conversions (NULL point_id)
 * Only parents can run this
 */
router.post('/cleanup-orphaned', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    console.log('[CLEANUP] Manual cleanup triggered by user:', req.user?.userId);
    const deletedCount = await cleanupOrphanedConversions();
    
    res.json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} orphaned conversion(s)`
    });
  } catch (error) {
    next(error);
  }
});

export default router;

