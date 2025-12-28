import { Router } from 'express';
import usersRoutes from './users.js';
import childrenRoutes from './children.js';
import pointsRoutes from './points.js';
import authRoutes from './auth.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/children', childrenRoutes);
router.use('/points', pointsRoutes);

export default router;


