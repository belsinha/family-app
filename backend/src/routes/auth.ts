import { Router } from 'express';
import { getUserByName, getUserByIdWithPassword, updateUserPassword } from '../db/queries/users.js';
import { generateToken, comparePassword, hashPassword } from '../utils/auth.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { saveDatabase } from '../db/connection.js';
import type { User } from '../types.js';

const router = Router();

interface LoginRequest {
  name: string;
  password: string;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

router.post('/login', async (req, res, next) => {
  try {
    const { name, password }: LoginRequest = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    const user = getUserByName(name);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'User account not set up with password' });
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        house_id: user.house_id,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword }: ChangePasswordRequest = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = getUserByIdWithPassword(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: 'User account not set up with password' });
    }

    const isValidPassword = await comparePassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    const updated = updateUserPassword(req.user.userId, newPasswordHash);
    
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update password' });
    }

    saveDatabase();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;

