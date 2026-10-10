import { getSupabaseClient } from '../supabase.js';
import type { Point } from '../../types.js';
import type { TaskPointRequest } from '../../services/taskPointRequest.js';

export async function getTaskPointRequest(parentId: number, requestId: string): Promise<Point | null> {
  const { data, error } = await getSupabaseClient().from('points').select('*')
    .eq('task_actor_id', parentId).eq('request_id', requestId).maybeSingle();
  if (error) throw new Error('Could not read task point request');
  return data as Point | null;
}

export async function insertTaskPoint(
  request: TaskPointRequest, parentId: number, houseId: number,
  snapshot: NonNullable<Point['task_snapshot']>, fingerprint: string,
): Promise<{ point: Point; replayed: boolean }> {
  const { data, error } = await getSupabaseClient().from('points').insert({
    child_id: request.childId, points: request.points, type: request.type, reason: request.reason,
    parent_id: parentId, task_actor_id: parentId, source: 'task', task_instance_id: request.taskInstanceId,
    task_house_id: houseId, task_snapshot: snapshot,
    request_id: request.requestId, request_fingerprint: fingerprint,
  }).select('*').single();
  if (!error && data) return { point: data as Point, replayed: false };
  // The unique index, rather than a process-local lock, serializes concurrent retries.
  if (error?.code === '23505') {
    const point = await getTaskPointRequest(parentId, request.requestId);
    if (point) return { point, replayed: true };
  }
  throw new Error('Could not record task points');
}

export async function voidTaskPoint(point: Point, parentId: number, reason: string): Promise<Point> {
  const { data, error } = await getSupabaseClient().from('points').update({
    voided_at: new Date().toISOString(), voided_by: parentId, void_reason: reason,
  }).eq('id', point.id).eq('child_id', point.child_id).eq('source', 'task')
    .is('voided_at', null).select('*').maybeSingle();
  if (error) throw new Error('Could not void task points');
  if (data) return data as Point;
  const { data: existing, error: readError } = await getSupabaseClient().from('points')
    .select('*').eq('id', point.id).eq('child_id', point.child_id).single();
  if (readError) throw new Error('Could not read task points');
  return existing as Point;
}
