import { getSupabaseClient } from '../supabase.js';
import type { User, Role } from '../../types.js';

export async function getAllUsers(): Promise<User[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, house_id');
  
  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
  
  return (data || []) as User[];
}

export async function getUserById(id: number): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, house_id')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
  
  return data as User | null;
}

export async function getUsersByRole(role: Role): Promise<User[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, house_id')
    .eq('role', role);
  
  if (error) {
    throw new Error(`Failed to fetch users by role: ${error.message}`);
  }
  
  return (data || []) as User[];
}

export async function getUserByName(name: string): Promise<(User & { password_hash?: string }) | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, house_id, password_hash')
    .eq('name', name)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch user by name: ${error.message}`);
  }
  
  return data as (User & { password_hash?: string }) | null;
}

export async function getUserByIdWithPassword(id: number): Promise<(User & { password_hash?: string }) | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, house_id, password_hash')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch user with password: ${error.message}`);
  }
  
  return data as (User & { password_hash?: string }) | null;
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', userId);
  
  if (error) {
    throw new Error(`Failed to update password: ${error.message}`);
  }
  
  // Verify the update
  const updatedUser = await getUserByIdWithPassword(userId);
  return updatedUser !== null && updatedUser.password_hash === passwordHash;
}
