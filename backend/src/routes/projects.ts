import { Router } from 'express';
import {
  createProject,
  getAllProjects,
  getActiveProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from '../db/queries/projects.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import type { CreateProjectRequest, UpdateProjectRequest } from '../types.js';

const router = Router();

// Get all projects (parents only)
router.get('/', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const projects = await getAllProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Get active projects (children can see these)
router.get('/active', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const projects = await getActiveProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Get project by ID (parents only)
router.get('/:projectId', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Create project (parents only)
router.post('/', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const { name, description, startDate, endDate, bonusRate, status }: CreateProjectRequest = req.body;
    
    if (!name || !startDate || bonusRate === undefined) {
      return res.status(400).json({ error: 'Missing required fields: name, startDate, bonusRate' });
    }
    
    // Validate bonus rate is non-negative
    if (typeof bonusRate !== 'number' || bonusRate < 0) {
      return res.status(400).json({ error: 'Bonus rate must be a non-negative number' });
    }
    
    // Validate dates
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid start date' });
    }
    
    let end: Date | null = null;
    if (endDate) {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid end date' });
      }
      if (end < start) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }
    }
    
    const project = await createProject(
      name.trim(),
      description?.trim() || null,
      startDate,
      endDate || null,
      bonusRate,
      status || 'active'
    );
    
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Update project (parents only)
router.put('/:projectId', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { name, description, startDate, endDate, bonusRate, status }: UpdateProjectRequest = req.body;
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    if (!name || !startDate || bonusRate === undefined || !status) {
      return res.status(400).json({ error: 'Missing required fields: name, startDate, bonusRate, status' });
    }
    
    // Validate bonus rate is non-negative
    if (typeof bonusRate !== 'number' || bonusRate < 0) {
      return res.status(400).json({ error: 'Bonus rate must be a non-negative number' });
    }
    
    // Validate dates
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid start date' });
    }
    
    let end: Date | null = null;
    if (endDate) {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid end date' });
      }
      if (end < start) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }
    }
    
    // Verify project exists
    const existingProject = await getProjectById(projectId);
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = await updateProject(
      projectId,
      name.trim(),
      description?.trim() || null,
      startDate,
      endDate || null,
      bonusRate,
      status
    );
    
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Delete/deactivate project (parents only)
router.delete('/:projectId', authenticate, requireRole('parent'), async (req: AuthRequest, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Verify project exists
    const existingProject = await getProjectById(projectId);
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const deleted = await deleteProject(projectId);
    
    if (deleted) {
      res.json({ message: 'Project deleted successfully' });
    } else {
      res.json({ message: 'Project deactivated (has associated work logs)' });
    }
  } catch (error) {
    next(error);
  }
});

export default router;

