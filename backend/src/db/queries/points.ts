import { getSupabaseClient } from '../supabase.js';
import type { Point, PointType } from '../../types.js';

export async function addPoints(
  childId: number,
  points: number,
  type: PointType,
  reason?: string,
  parentId?: number
): Promise<Point> {
  const supabase = getSupabaseClient();
  
  // Insert the point
  const { data: insertedPoint, error: insertError } = await supabase
    .from('points')
    .insert({
      child_id: childId,
      points,
      type,
      reason: reason || null,
      parent_id: parentId || null,
    })
    .select()
    .single();
  
  if (insertError || !insertedPoint) {
    throw new Error(`Failed to insert point: ${insertError?.message || 'Unknown error'}`);
  }
  
  // Fetch parent name if parent_id exists
  let parentName = null;
  if (insertedPoint.parent_id) {
    const { data: parent } = await supabase
      .from('users')
      .select('name')
      .eq('id', insertedPoint.parent_id)
      .single();
    parentName = parent?.name || null;
  }
  
  return {
    ...insertedPoint,
    parent_name: parentName,
  } as Point;
}

export async function getPointsByChildId(childId: number): Promise<Point[]> {
  const supabase = getSupabaseClient();
  const { data: points, error } = await supabase
    .from('points')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch points: ${error.message}`);
  }
  
  if (!points || points.length === 0) {
    return [];
  }
  
  // Get unique parent IDs
  const parentIds = [...new Set(points.map((p: any) => p.parent_id).filter(Boolean))];
  
  // Fetch all parent names in one query
  const parentNames: { [key: number]: string } = {};
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('users')
      .select('id, name')
      .in('id', parentIds);
    
    if (parents) {
      parents.forEach((parent: any) => {
        parentNames[parent.id] = parent.name;
      });
    }
  }
  
  // Map points with parent names
  return points.map((point: any) => ({
    ...point,
    parent_name: point.parent_id ? (parentNames[point.parent_id] || null) : null,
  })) as Point[];
}

export async function getChildBalance(childId: number): Promise<{ bonus: number; demerit: number; balance: number }> {
  const supabase = getSupabaseClient();
  
  // Get bonus points
  const { data: bonusData, error: bonusError } = await supabase
    .from('points')
    .select('points')
    .eq('child_id', childId)
    .eq('type', 'bonus');
  
  if (bonusError) {
    throw new Error(`Failed to fetch bonus points: ${bonusError.message}`);
  }
  
  // Get demerit points
  const { data: demeritData, error: demeritError } = await supabase
    .from('points')
    .select('points')
    .eq('child_id', childId)
    .eq('type', 'demerit');
  
  if (demeritError) {
    throw new Error(`Failed to fetch demerit points: ${demeritError.message}`);
  }
  
  const bonus = (bonusData || []).reduce((sum, p) => sum + (p.points || 0), 0);
  const demerit = (demeritData || []).reduce((sum, p) => sum + (p.points || 0), 0);
  const balance = bonus - demerit;
  
  return { bonus, demerit, balance };
}

export async function getMostRecentPoint(childId: number): Promise<Point | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('points')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch most recent point: ${error.message}`);
  }
  
  // Fetch parent name if parent_id exists
  let parentName = null;
  if (data.parent_id) {
    const { data: parent } = await supabase
      .from('users')
      .select('name')
      .eq('id', data.parent_id)
      .single();
    parentName = parent?.name || null;
  }
  
  return {
    ...data,
    parent_name: parentName,
  } as Point;
}

export async function getPointsByChildIdLast7Days(childId: number): Promise<Point[]> {
  const supabase = getSupabaseClient();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data: points, error } = await supabase
    .from('points')
    .select('*')
    .eq('child_id', childId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch points: ${error.message}`);
  }
  
  if (!points || points.length === 0) {
    return [];
  }
  
  // Get unique parent IDs
  const parentIds = [...new Set(points.map((p: any) => p.parent_id).filter(Boolean))];
  
  // Fetch all parent names in one query
  const parentNames: { [key: number]: string } = {};
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('users')
      .select('id, name')
      .in('id', parentIds);
    
    if (parents) {
      parents.forEach((parent: any) => {
        parentNames[parent.id] = parent.name;
      });
    }
  }
  
  // Map points with parent names
  return points.map((point: any) => ({
    ...point,
    parent_name: point.parent_id ? (parentNames[point.parent_id] || null) : null,
  })) as Point[];
}

export async function deletePoint(pointId: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  // Check if the point exists
  const { data: existingPoint, error: checkError } = await supabase
    .from('points')
    .select('id')
    .eq('id', pointId)
    .single();
  
  if (checkError || !existingPoint) {
    return false;
  }
  
  // Delete the point
  const { error: deleteError } = await supabase
    .from('points')
    .delete()
    .eq('id', pointId);
  
  if (deleteError) {
    throw new Error(`Failed to delete point: ${deleteError.message}`);
  }
  
  return true;
}
