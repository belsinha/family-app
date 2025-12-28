export type Role = 'parent' | 'child' | 'family';
export type PointType = 'bonus' | 'demerit';

export interface House {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  role: Role;
  house_id: number | null;
  password_hash?: string;
}

export interface Child {
  id: number;
  name: string;
  user_id: number | null;
  house_id: number | null;
}

export interface Point {
  id: number;
  child_id: number;
  points: number;
  type: PointType;
  reason: string | null;
  created_at: string;
  parent_id: number | null;
  parent_name?: string | null;
}

export interface ChildBalance {
  childId: number;
  bonus: number;
  demerit: number;
  balance: number;
}

// API Request/Response types
export interface AddPointsRequest {
  childId: number;
  points: number;
  type: PointType;
  reason?: string;
  description?: string;
  anonymous?: boolean;
}

export interface ApiError {
  error: string;
  message?: string;
}

export interface LoginRequest {
  name: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'password_hash'>;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}


