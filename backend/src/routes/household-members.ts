import { Router } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const members = await prisma.householdMember.findMany({
      orderBy: { id: 'asc' },
    });
    res.json(members);
  } catch (e) {
    next(e);
  }
});

export default router;
