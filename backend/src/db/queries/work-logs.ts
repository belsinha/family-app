import { getSupabaseClient } from '../supabase.js';
import type { WorkLog } from '../../types.js';

export async function addWorkLog(
  childId: number,
  hours: number,
  description: string,
  workDate?: string
): Promise<WorkLog> {
  const supabase = getSupabaseClient();
  
  // Use provided date or default to current date
  const dateToUse = workDate || new Date().toISOString().split('T')[0];
  
  // Insert the work log
  const { data: insertedLog, error: insertError } = await supabase
    .from('work_logs')
    .insert({
      child_id: childId,
      hours,
      description,
      work_date: dateToUse,
    })
    .select()
    .single();
  
  if (insertError || !insertedLog) {
    throw new Error(`Failed to insert work log: ${insertError?.message || 'Unknown error'}`);
  }
  
  return insertedLog as WorkLog;
}

export async function getWorkLogsByChildId(childId: number): Promise<WorkLog[]> {
  const supabase = getSupabaseClient();
  const { data: workLogs, error } = await supabase
    .from('work_logs')
    .select('*')
    .eq('child_id', childId)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch work logs: ${error.message}`);
  }
  
  return (workLogs || []) as WorkLog[];
}

