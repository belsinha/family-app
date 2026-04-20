import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import {
  computeMonthlyAllowanceBreakdown,
  assertValidYearMonth,
} from '../services/allowance.js';
import {
  hasFullChoresAccess,
  resolveHouseholdMemberIdForChildUser,
} from '../services/choresAccess.js';

const router = Router();

router.get('/monthly/:yearMonth/preview', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { yearMonth } = req.params;
    try {
      assertValidYearMonth(yearMonth);
    } catch {
      return res.status(400).json({ error: 'yearMonth must be YYYY-MM' });
    }

    if (hasFullChoresAccess(req.user.role)) {
      const breakdown = await computeMonthlyAllowanceBreakdown(yearMonth);
      return res.json({ yearMonth, breakdown });
    }

    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
    if (mid == null) {
      return res.json({ yearMonth, breakdown: [] });
    }
    const breakdown = await computeMonthlyAllowanceBreakdown(yearMonth, { householdMemberId: mid });
    return res.json({ yearMonth, breakdown });
  } catch (e) {
    next(e);
  }
});

router.get('/monthly/:yearMonth/lines', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { yearMonth } = req.params;
    try {
      assertValidYearMonth(yearMonth);
    } catch {
      return res.status(400).json({ error: 'yearMonth must be YYYY-MM' });
    }

    if (hasFullChoresAccess(req.user.role)) {
      const lines = await prisma.monthlyAllowance.findMany({
        where: { yearMonth },
        include: { householdMember: true },
        orderBy: { householdMemberId: 'asc' },
      });
      return res.json({ yearMonth, lines });
    }

    const mid = await resolveHouseholdMemberIdForChildUser(req.user.userId, req.user.name);
    if (mid == null) {
      return res.json({ yearMonth, lines: [] });
    }
    const lines = await prisma.monthlyAllowance.findMany({
      where: { yearMonth, householdMemberId: mid },
      include: { householdMember: true },
    });
    return res.json({ yearMonth, lines });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/monthly/:yearMonth/submit-for-approval',
  authenticate,
  requireRole('parent'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { yearMonth } = req.params;
      try {
        assertValidYearMonth(yearMonth);
      } catch {
        return res.status(400).json({ error: 'yearMonth must be YYYY-MM' });
      }

      const breakdown = await computeMonthlyAllowanceBreakdown(yearMonth);
      const submittedAt = new Date().toISOString();

      const results = [];
      for (const row of breakdown) {
        const existing = await prisma.monthlyAllowance.findUnique({
          where: {
            yearMonth_householdMemberId: {
              yearMonth,
              householdMemberId: row.householdMemberId,
            },
          },
          include: { householdMember: true },
        });

        if (existing?.status === 'APPROVED') {
          results.push({ ...existing, skipped: true as const });
          continue;
        }

        const saved = await prisma.monthlyAllowance.upsert({
          where: {
            yearMonth_householdMemberId: {
              yearMonth,
              householdMemberId: row.householdMemberId,
            },
          },
          create: {
            yearMonth,
            householdMemberId: row.householdMemberId,
            baseCents: row.baseCents,
            requiredChoreCount: row.requiredChoreCount,
            completedChoreCount: row.completedChoreCount,
            pendingChoreCount: row.pendingChoreCount,
            missedChoreCount: row.missedChoreCount,
            excusedChoreCount: row.excusedChoreCount,
            proposedCents: row.proposedCents,
            status: 'PENDING_APPROVAL',
            submittedAt,
          },
          update: {
            baseCents: row.baseCents,
            requiredChoreCount: row.requiredChoreCount,
            completedChoreCount: row.completedChoreCount,
            pendingChoreCount: row.pendingChoreCount,
            missedChoreCount: row.missedChoreCount,
            excusedChoreCount: row.excusedChoreCount,
            proposedCents: row.proposedCents,
            status: 'PENDING_APPROVAL',
            submittedAt,
            decidedAt: null,
            approverUserId: null,
            rejectionReason: null,
          },
          include: { householdMember: true },
        });
        results.push(saved);
      }

      res.json({ yearMonth, lines: results });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/lines/:lineId/approve',
  authenticate,
  requireRole('parent'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const lineId = parseInt(req.params.lineId, 10);
      if (Number.isNaN(lineId)) {
        return res.status(400).json({ error: 'Invalid line id' });
      }

      const line = await prisma.monthlyAllowance.findUnique({
        where: { id: lineId },
        include: { householdMember: true },
      });
      if (!line) {
        return res.status(404).json({ error: 'Allowance line not found' });
      }
      if (line.status !== 'PENDING_APPROVAL') {
        return res.status(400).json({ error: 'Only pending lines can be approved' });
      }

      const decidedAt = new Date().toISOString();
      const updated = await prisma.monthlyAllowance.update({
        where: { id: lineId },
        data: {
          status: 'APPROVED',
          decidedAt,
          approverUserId: req.user.userId,
          rejectionReason: null,
        },
        include: { householdMember: true },
      });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/lines/:lineId/reject',
  authenticate,
  requireRole('parent'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const lineId = parseInt(req.params.lineId, 10);
      if (Number.isNaN(lineId)) {
        return res.status(400).json({ error: 'Invalid line id' });
      }

      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim().slice(0, 2000)
          : null;

      const line = await prisma.monthlyAllowance.findUnique({
        where: { id: lineId },
        include: { householdMember: true },
      });
      if (!line) {
        return res.status(404).json({ error: 'Allowance line not found' });
      }
      if (line.status !== 'PENDING_APPROVAL') {
        return res.status(400).json({ error: 'Only pending lines can be rejected' });
      }

      const decidedAt = new Date().toISOString();
      const updated = await prisma.monthlyAllowance.update({
        where: { id: lineId },
        data: {
          status: 'REJECTED',
          decidedAt,
          approverUserId: req.user.userId,
          rejectionReason: reason,
        },
        include: { householdMember: true },
      });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);

export default router;
