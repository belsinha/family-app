import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config.js';
import type { User, Role } from '../types.js';

export interface AuthTokenPayload {
  userId: number;
  role: Role;
  name: string;
}

export function generateToken(user: User): string {
  const payload: AuthTokenPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
  };
  const expiresIn = user.role === 'child' ? config.jwt.childExpiresIn : config.jwt.expiresIn;
  return jwt.sign(payload, config.jwt.secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret) as AuthTokenPayload;
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.security.bcryptCost);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export { MAX_LOGIN_NAME_LENGTH, normalizeLoginName } from './loginName.js';

export const MAX_PASSWORD_LENGTH = 128;

export const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'letmein',
  'qwerty',
  'qwerty123',
  'changeme',
  '12345678',
  '123456789',
  'admin',
  'admin123',
  'welcome1',
]);

/**
 * Password policy is deliberately role-aware: child accounts keep the simple, low-friction
 * scheme they've always had (their own name works fine), while parent/family accounts are
 * admin-equivalent (can add/remove points, manage money/bitcoin payouts) and get held to a
 * real complexity bar.
 */
export function validatePasswordStrength(password: string, role: Role, loginName?: string): string | null {
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`;
  }

  if (role === 'child') {
    if (password.length < 4) {
      return 'New password must be at least 4 characters long';
    }
    return null;
  }

  // parent / family
  const MIN_LENGTH = 10;
  if (password.length < MIN_LENGTH) {
    return `New password must be at least ${MIN_LENGTH} characters long`;
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) {
    return 'New password must include at least 3 of: lowercase, uppercase, number, symbol';
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'New password is too common; choose something less guessable';
  }

  if (loginName && password.toLowerCase().includes(loginName.toLowerCase())) {
    return 'New password must not contain your login name';
  }

  return null;
}

/** Generates a random high-entropy password, used to seed parent/admin accounts. */
export function generateStrongPassword(byteLength = 18): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}
