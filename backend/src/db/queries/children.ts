import { getSupabaseClient } from '../supabase.js';
import type { Child } from '../../types.js';

export async function getAllChildren(): Promise<Child[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('children')
    .select('*');
  
  if (error) {
    throw new Error(`Failed to fetch children: ${error.message}`);
  }
  
  return (data || []) as Child[];
}

export async function getChildById(id: number): Promise<Child | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch child: ${error.message}`);
  }
  
  return data as Child | null;
}

export async function getChildrenByHouseId(houseId: number): Promise<Child[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('house_id', houseId);
  
  if (error) {
    throw new Error(`Failed to fetch children by house: ${error.message}`);
  }
  
  return (data || []) as Child[];
}

export async function getChildByUserId(userId: number): Promise<Child | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch child by user: ${error.message}`);
  }
  
  return data as Child | null;
}
