import { getSupabaseClient } from '../supabase.js';
import type { Project } from '../../types.js';

export async function createProject(
  name: string,
  description: string | null,
  startDate: string,
  endDate: string | null,
  bonusRate: number,
  status: 'active' | 'inactive' = 'active'
): Promise<Project> {
  const supabase = getSupabaseClient();
  
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name,
      description: description || null,
      start_date: startDate,
      end_date: endDate || null,
      bonus_rate: bonusRate,
      status,
    })
    .select()
    .single();
  
  if (error || !project) {
    throw new Error(`Failed to create project: ${error?.message || 'Unknown error'}`);
  }
  
  return project as Project;
}

export async function getAllProjects(): Promise<Project[]> {
  const supabase = getSupabaseClient();
  
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch projects: ${error.message}`);
  }
  
  return (projects || []) as Project[];
}

export async function getActiveProjects(): Promise<Project[]> {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];
  
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'active')
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('name', { ascending: true });
  
  if (error) {
    throw new Error(`Failed to fetch active projects: ${error.message}`);
  }
  
  return (projects || []) as Project[];
}

export async function getProjectById(projectId: number): Promise<Project | null> {
  const supabase = getSupabaseClient();
  
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch project: ${error.message}`);
  }
  
  return project as Project | null;
}

export async function updateProject(
  projectId: number,
  name: string,
  description: string | null,
  startDate: string,
  endDate: string | null,
  bonusRate: number,
  status: 'active' | 'inactive'
): Promise<Project> {
  const supabase = getSupabaseClient();
  
  const { data: project, error } = await supabase
    .from('projects')
    .update({
      name,
      description: description || null,
      start_date: startDate,
      end_date: endDate || null,
      bonus_rate: bonusRate,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .select()
    .single();
  
  if (error || !project) {
    throw new Error(`Failed to update project: ${error?.message || 'Unknown error'}`);
  }
  
  return project as Project;
}

export async function deleteProject(projectId: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  // Check if any work logs reference this project
  const { data: workLogs, error: checkError } = await supabase
    .from('work_logs')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);
  
  if (checkError) {
    throw new Error(`Failed to check project usage: ${checkError.message}`);
  }
  
  if (workLogs && workLogs.length > 0) {
    // Cannot delete project with work logs - deactivate instead
    const { error: updateError } = await supabase
      .from('projects')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', projectId);
    
    if (updateError) {
      throw new Error(`Failed to deactivate project: ${updateError.message}`);
    }
    
    return false; // Indicates we deactivated instead of deleted
  }
  
  const { error: deleteError } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);
  
  if (deleteError) {
    throw new Error(`Failed to delete project: ${deleteError.message}`);
  }
  
  return true;
}

