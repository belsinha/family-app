import { getSupabaseClient } from '../supabase.js';
import type { WorkLog } from '../../types.js';

export async function addWorkLog(
  childId: number,
  projectId: number,
  hours: number,
  description: string,
  workDate?: string
): Promise<WorkLog> {
  const supabase = getSupabaseClient();
  
  // Use provided date or default to current date
  const dateToUse = workDate || new Date().toISOString().split('T')[0];
  
  // Insert the work log with status 'pending'
  const { data: insertedLog, error: insertError } = await supabase
    .from('work_logs')
    .insert({
      child_id: childId,
      project_id: projectId,
      hours,
      description,
      work_date: dateToUse,
      status: 'pending',
    })
    .select()
    .single();
  
  if (insertError || !insertedLog) {
    // If table doesn't exist, provide helpful error message
    if (insertError) {
      const errorMsg = insertError.message?.toLowerCase() || '';
      const errorCode = insertError.code || '';
      if (
        errorMsg.includes('relation') || 
        errorMsg.includes('does not exist') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache') ||
        errorCode === 'PGRST116' ||
        errorCode === '42P01'
      ) {
        throw new Error('work_logs table does not exist. Please run the SQL in backend/src/db/schema-postgres-supabase.sql to create it, or run it manually in your Supabase SQL editor.');
      }
    }
    throw new Error(`Failed to insert work log: ${insertError?.message || 'Unknown error'}`);
  }
  
  return insertedLog as WorkLog;
}

export async function getWorkLogsByChildId(childId: number): Promise<WorkLog[]> {
  const supabase = getSupabaseClient();
  const { data: workLogs, error } = await supabase
    .from('work_logs')
    .select(`
      *,
      project:projects(*)
    `)
    .eq('child_id', childId)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });
  
  if (error) {
    // If table doesn't exist, return empty array instead of throwing
    const errorMsg = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';
    if (
      errorMsg.includes('relation') || 
      errorMsg.includes('does not exist') ||
      errorMsg.includes('could not find the table') ||
      errorMsg.includes('schema cache') ||
      errorCode === 'PGRST116' ||
      errorCode === '42P01'
    ) {
      console.warn('work_logs table does not exist yet. Run the migration or create the table using the SQL in backend/src/db/schema-postgres-supabase.sql');
      return [];
    }
    throw new Error(`Failed to fetch work logs: ${error.message}`);
  }
  
  // Map the results to include project data
  return (workLogs || []).map((log: any) => ({
    ...log,
    project: log.project || null,
  })) as WorkLog[];
}

export async function getPendingWorkLogs(): Promise<any[]> {
  const supabase = getSupabaseClient();
  const { data: workLogs, error } = await supabase
    .from('work_logs')
    .select(`
      *,
      project:projects(*),
      child:children(id, name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  
  if (error) {
    throw new Error(`Failed to fetch pending work logs: ${error.message}`);
  }
  
  return (workLogs || []).map((log: any) => ({
    ...log,
    project: log.project || null,
    child: log.child || null,
  }));
}

export async function updateWorkLog(
  workLogId: number,
  hours: number,
  description: string,
  workDate?: string
): Promise<WorkLog> {
  const supabase = getSupabaseClient();
  
  // First check if the work log exists and its current status
  const existingLog = await getWorkLogById(workLogId);
  if (!existingLog) {
    throw new Error('Work log not found');
  }
  
  // Cannot edit if status is not pending
  if (existingLog.status !== 'pending') {
    throw new Error('Cannot edit work log that has been approved or declined');
  }
  
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
    .select(`
      *,
      project:projects(*)
    `)
    .single();
  
  if (updateError || !updatedLog) {
    throw new Error(`Failed to update work log: ${updateError?.message || 'Unknown error'}`);
  }
  
  return {
    ...updatedLog,
    project: (updatedLog as any).project || null,
  } as WorkLog;
}

export async function updateWorkLogStatus(
  workLogId: number,
  status: 'approved' | 'declined'
): Promise<WorkLog> {
  const supabase = getSupabaseClient();
  
  // Get the current work log to verify it's pending
  const existingLog = await getWorkLogById(workLogId);
  if (!existingLog) {
    throw new Error('Work log not found');
  }
  
  if (existingLog.status !== 'pending') {
    throw new Error(`Work log is already ${existingLog.status} and cannot be changed`);
  }
  
  // Ensure status value is lowercase and matches constraint exactly
  const statusValue = status.toLowerCase() as 'approved' | 'declined';
  
  if (statusValue !== 'approved' && statusValue !== 'declined') {
    throw new Error(`Invalid status value: ${status}`);
  }
  
  // Update the status with explicit type casting
  const { data: updatedLog, error: updateError } = await supabase
    .from('work_logs')
    .update({ status: statusValue })
    .eq('id', workLogId)
    .eq('status', 'pending') // Additional safety check
    .select(`
      *,
      project:projects(*)
    `)
    .single();
  
  if (updateError) {
    // Provide more detailed error information
    const errorMsg = updateError.message || 'Unknown error';
    const errorCode = updateError.code || '';
    const errorDetails = updateError.details || '';
    
    console.error('Update work log status error:', {
      message: errorMsg,
      code: errorCode,
      details: errorDetails,
      statusValue,
      workLogId,
      existingStatus: existingLog.status,
    });
    
    throw new Error(`Failed to update work log status: ${errorMsg}${errorDetails ? ` (${errorDetails})` : ''}`);
  }
  
  if (!updatedLog) {
    throw new Error('Work log was not updated (no rows affected)');
  }
  
  return {
    ...updatedLog,
    project: (updatedLog as any).project || null,
  } as WorkLog;
}

export async function getWorkLogById(workLogId: number): Promise<WorkLog | null> {
  const supabase = getSupabaseClient();
  const { data: workLog, error } = await supabase
    .from('work_logs')
    .select(`
      *,
      project:projects(*)
    `)
    .eq('id', workLogId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch work log: ${error.message}`);
  }
  
  if (!workLog) {
    return null;
  }
  
  return {
    ...workLog,
    project: (workLog as any).project || null,
  } as WorkLog;
}

