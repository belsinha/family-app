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
    // If table doesn't exist, provide helpful error message
    if (insertError && (insertError.message.includes('relation') || insertError.message.includes('does not exist') || insertError.code === 'PGRST116')) {
      throw new Error('work_logs table does not exist. Please run the database migration to create it.');
    }
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
    // If table doesn't exist, return empty array instead of throwing
    if (error.message && (error.message.includes('relation') || error.message.includes('does not exist') || error.code === 'PGRST116')) {
      console.warn('work_logs table does not exist yet. Run the migration or create the table.');
      return [];
    }
    throw new Error(`Failed to fetch work logs: ${error.message}`);
  }
  
  return (workLogs || []) as WorkLog[];
}

export async function updateWorkLog(
  workLogId: number,
  hours: number,
  description: string,
  workDate?: string
): Promise<WorkLog> {
  const supabase = getSupabaseClient();
  
  const updateData: any = {
    hours,
    description,
  };
  
  if (workDate) {
    updateData.work_date = workDate;
  }
  
  // Update the work log
  const { data: updatedLog, error: updateError } = await supabase
    .from('work_logs')
    .update(updateData)
    .eq('id', workLogId)
    .select()
    .single();
  
  if (updateError || !updatedLog) {
    throw new Error(`Failed to update work log: ${updateError?.message || 'Unknown error'}`);
  }
  
  return updatedLog as WorkLog;
}

export async function getWorkLogById(workLogId: number): Promise<WorkLog | null> {
  const supabase = getSupabaseClient();
  const { data: workLog, error } = await supabase
    .from('work_logs')
    .select('*')
    .eq('id', workLogId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch work log: ${error.message}`);
  }
  
  return workLog as WorkLog | null;
}

