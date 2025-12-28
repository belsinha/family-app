import type { Role } from '../../../shared/src/types';

export function isParent(role: Role): boolean {
  return role === 'parent';
}

export function isChild(role: Role): boolean {
  return role === 'child';
}

export function isFamily(role: Role): boolean {
  return role === 'family';
}

export function hasPermission(role: Role, requiredRole: Role | Role[]): boolean {
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(role);
  }
  return role === requiredRole;
}





