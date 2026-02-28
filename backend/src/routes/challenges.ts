import { Router } from 'express';
import {
  createChallenge,
  getChallengesByChildId,
  getChallengeById,
  updateChallenge,
  getProgressByChallengeId,
  addProgressEntry,
} from '../db/queries/challenges.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getChildByUserId } from '../db/queries/children.js';
import { addPoints } from '../db/queries/points.js';

const router = Router();

function ensureChildAccess(req: AuthRequest, childId: number): Promise<{ allowed: boolean }> {
  if (req.user?.role === 'parent') return Promise.resolve({ allowed: true });
  return getChildByUserId(req.user!.userId).then((child) => ({
    allowed: !!child && child.id === childId,
  }));
}

function ensureChallengeAccess(req: AuthRequest, challengeChildId: number): Promise<{ allowed: boolean }> {
  if (req.user?.role === 'parent') return Promise.resolve({ allowed: true });
  return getChildByUserId(req.user!.userId).then((child) => ({
    allowed: !!child && child.id === challengeChildId,
  }));
}

// List challenges for a child (parent: any child; child: only self)
router.get('/child/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    if (isNaN(childId)) return res.status(400).json({ error: 'Invalid child ID' });

    const { allowed } = await ensureChildAccess(req, childId);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const challenges = await getChallengesByChildId(childId);
    res.json(challenges);
  } catch (err) {
    next(err);
  }
});

// Create challenge (parent only)
router.post('/', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const {
      childId,
      title,
      description,
      deadline,
      rewardType,
      rewardPoints,
      rewardDescription,
      targetNumber,
      targetUnit,
    } = req.body;

    if (!childId || !title || !deadline || !rewardType) {
      return res.status(400).json({
        error: 'Missing required fields: childId, title, deadline, rewardType',
      });
    }

    if (rewardType !== 'bonus_points' && rewardType !== 'custom') {
      return res.status(400).json({ error: 'rewardType must be bonus_points or custom' });
    }

    if (rewardType === 'bonus_points' && (rewardPoints == null || Number(rewardPoints) < 0)) {
      return res.status(400).json({ error: 'rewardPoints required and must be >= 0 for bonus_points' });
    }

    const challenge = await createChallenge({
      child_id: Number(childId),
      title: String(title).trim(),
      description: description != null ? String(description).trim() || null : null,
      deadline: String(deadline),
      reward_type: rewardType,
      reward_points: rewardType === 'bonus_points' ? Number(rewardPoints) : null,
      reward_description: rewardType === 'custom' && rewardDescription != null ? String(rewardDescription) : null,
      target_number: targetNumber != null ? Number(targetNumber) : null,
      target_unit: targetUnit != null ? String(targetUnit) : null,
      created_by: req.user?.userId ?? null,
    });

    res.status(201).json(challenge);
  } catch (err) {
    next(err);
  }
});

// Get one challenge with progress (parent: any; child: only own)
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid challenge ID' });

    const challenge = await getChallengeById(id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const { allowed } = await ensureChallengeAccess(req, challenge.child_id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const progress = await getProgressByChallengeId(id);
    res.json({ ...challenge, progress });
  } catch (err) {
    next(err);
  }
});

// Update challenge (parent: full; child: only status to completed for own)
router.patch('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid challenge ID' });

    const challenge = await getChallengeById(id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const { allowed } = await ensureChallengeAccess(req, challenge.child_id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const isChild = req.user?.role === 'child';
    const body = req.body;

    if (isChild) {
      const status = body.status;
      if (status !== 'completed') {
        return res.status(403).json({ error: 'You can only mark a challenge as completed' });
      }
      const updated = await updateChallenge(id, { status: 'completed' });

      if (
        challenge.reward_type === 'bonus_points' &&
        challenge.reward_points != null &&
        challenge.reward_points > 0 &&
        !challenge.rewarded_at
      ) {
        await addPoints(
          challenge.child_id,
          challenge.reward_points,
          'bonus',
          `Challenge: ${challenge.title}`,
          req.user?.userId
        );
        const withRewarded = await updateChallenge(id, {
          rewarded_at: new Date().toISOString(),
        });
        return res.json(withRewarded);
      }
      return res.json(updated);
    }

    const updates: Parameters<typeof updateChallenge>[1] = {};
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.description !== undefined) updates.description = body.description ? String(body.description) : null;
    if (body.deadline !== undefined) updates.deadline = String(body.deadline);
    if (body.reward_type !== undefined) updates.reward_type = body.reward_type;
    if (body.reward_points !== undefined) updates.reward_points = body.reward_points == null ? null : Number(body.reward_points);
    if (body.reward_description !== undefined) updates.reward_description = body.reward_description ? String(body.reward_description) : null;
    if (body.target_number !== undefined) updates.target_number = body.target_number == null ? null : Number(body.target_number);
    if (body.target_unit !== undefined) updates.target_unit = body.target_unit ? String(body.target_unit) : null;
    if (body.status !== undefined) updates.status = body.status;

    const updated = await updateChallenge(id, updates);

    if (
      body.status === 'completed' &&
      challenge.reward_type === 'bonus_points' &&
      challenge.reward_points != null &&
      challenge.reward_points > 0 &&
      !challenge.rewarded_at
    ) {
      await addPoints(
        challenge.child_id,
        challenge.reward_points,
        'bonus',
        `Challenge: ${challenge.title}`,
        req.user?.userId
      );
      const withRewarded = await updateChallenge(id, {
        rewarded_at: new Date().toISOString(),
      });
      return res.json(withRewarded);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// List progress for a challenge (same auth as GET challenge)
router.get('/:id/progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid challenge ID' });

    const challenge = await getChallengeById(id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const { allowed } = await ensureChallengeAccess(req, challenge.child_id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const progress = await getProgressByChallengeId(id);
    res.json(progress);
  } catch (err) {
    next(err);
  }
});

// Add progress entry (child only, own challenge)
router.post('/:id/progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'child') {
      return res.status(403).json({ error: 'Only the child can log progress' });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid challenge ID' });

    const challenge = await getChallengeById(id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const child = await getChildByUserId(req.user.userId);
    if (!child || child.id !== challenge.child_id) {
      return res.status(403).json({ error: 'You can only log progress on your own challenges' });
    }

    if (challenge.status !== 'active' && challenge.status !== 'expired') {
      return res.status(400).json({ error: 'Cannot add progress to a completed or failed challenge' });
    }

    const { note, amount } = req.body;
    if (!note || typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ error: 'note is required' });
    }

    const entry = await addProgressEntry({
      challenge_id: id,
      note: note.trim(),
      amount: amount != null ? Number(amount) : null,
      created_by: req.user.userId,
    });

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

export default router;
