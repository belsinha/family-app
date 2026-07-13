import { Router } from 'express';
import { getUserByName, getUserByIdWithPassword, updateUserPassword } from '../db/queries/users.js';
import {
  generateToken,
  comparePassword,
  hashPassword,
  normalizeLoginName,
  validatePasswordStrength,
  MAX_PASSWORD_LENGTH,
} from '../utils/auth.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { loginIpRateLimiter, loginNameRateLimiter } from '../middleware/rateLimit.js';
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

router.post('/login', loginIpRateLimiter, loginNameRateLimiter, async (req, res, next) => {
  try {
    const { name, password }: LoginRequest = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const normalizedName = normalizeLoginName(name);
    if (!normalizedName) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    const user = await getUserByName(normalizedName);
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

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await getUserByIdWithPassword(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: 'User account not set up with password' });
    }

    const strengthError = validatePasswordStrength(newPassword, user.role, user.name);
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    const isValidPassword = await comparePassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    const updated = await updateUserPassword(req.user.userId, newPasswordHash);
    
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update password' });
    }
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;

