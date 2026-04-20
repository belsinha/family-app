import { Router } from 'express';
import usersRoutes from './users.js';
import childrenRoutes from './children.js';
import pointsRoutes from './points.js';
import authRoutes from './auth.js';
import bitcoinRoutes from './bitcoin.js';
import workLogsRoutes from './work-logs.js';
import projectsRoutes from './projects.js';
import householdMembersRoutes from './household-members.js';
import tasksRoutes from './tasks.js';
import templatesRoutes from './templates.js';
import choreCategoriesRoutes from './chore-categories.js';
import weeklySummaryRoutes from './weekly-summary.js';
import challengesRoutes from './challenges.js';
import onchainRoutes from './onchain.js';
import allowanceRoutes from './allowance.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/children', childrenRoutes);
router.use('/points', pointsRoutes);
router.use('/bitcoin', bitcoinRoutes);
router.use('/bitcoin', onchainRoutes);
router.use('/work-logs', workLogsRoutes);
router.use('/projects', projectsRoutes);
router.use('/household-members', householdMembersRoutes);
router.use('/tasks', tasksRoutes);
router.use('/templates', templatesRoutes);
router.use('/chore-categories', choreCategoriesRoutes);
router.use('/weekly-summary', weeklySummaryRoutes);
router.use('/challenges', challengesRoutes);
router.use('/allowance', allowanceRoutes);

export default router;


