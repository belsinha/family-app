import { getSupabaseClient } from '../supabase.js';
import type { ActiveTimer } from '../../types.js';

/** Raised when a start is attempted while the child already has a running timer. */
export class TimerAlreadyRunningError extends Error {
  constructor() {
    super('A timer is already running for this child');
    this.name = 'TimerAlreadyRunningError';
  }
}

export async function getActiveTimerByChildId(
  childId: number,
  houseId: number
): Promise<ActiveTimer | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('active_timers')
    .select(`
      *,
      project:projects(*)
    `)
    .eq('child_id', childId)
    .eq('house_id', houseId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No running timer
    }
    throw new Error(`Failed to fetch active timer: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    project: (data as any).project || null,
  } as ActiveTimer;
}

/**
 * Creates the active timer row for a child. The single-active-timer rule is enforced by
 * the UNIQUE constraint on active_timers.child_id, so a concurrent start from a second
 * device loses the race at the database rather than in application code.
 */
export async function startActiveTimer(
  houseId: number,
  childId: number,
  projectId: number
): Promise<ActiveTimer> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('active_timers')
    .insert({
      house_id: houseId,
      child_id: childId,
      project_id: projectId,
      started_at: new Date().toISOString(),
    })
    .select(`
      *,
      project:projects(*)
    `)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new TimerAlreadyRunningError();
    }
    throw new Error(`Failed to start timer: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to start timer: no row returned');
  }

  return {
    ...data,
    project: (data as any).project || null,
  } as ActiveTimer;
}

/**
 * Atomically removes and returns the child's active timer (null if none). Because the
 * delete both claims and returns the row, only one of two concurrent stop requests gets
 * the timer back — the other sees null, which is what makes stop idempotent.
 */
export async function claimActiveTimer(
  childId: number,
  houseId: number
): Promise<ActiveTimer | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('active_timers')
    .delete()
    .eq('child_id', childId)
    .eq('house_id', houseId)
    .select();

  if (error) {
    throw new Error(`Failed to stop timer: ${error.message}`);
  }

  const row = (data || [])[0];
  return row ? (row as ActiveTimer) : null;
}
