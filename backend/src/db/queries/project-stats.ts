import { getSupabaseClient } from '../supabase.js';

export interface ProjectChildHours {
  project_id: number;
  child_id: number;
  child_name: string;
  total_hours: number;
}

export interface ProjectStatistics {
  project_id: number;
  child_hours: ProjectChildHours[];
  total_hours: number;
}

/**
 * Get hours worked by each child for a specific project
 */
export async function getProjectChildHours(projectId: number): Promise<ProjectChildHours[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('work_logs')
    .select(`
      project_id,
      child_id,
      hours,
      child:children(id, name)
    `)
    .eq('project_id', projectId)
    .eq('status', 'approved'); // Only count approved work logs
  
  if (error) {
    throw new Error(`Failed to fetch project child hours: ${error.message}`);
  }
  
  // Group by child and sum hours
  const hoursByChild: { [childId: number]: { name: string; hours: number } } = {};
  
  (data || []).forEach((log: any) => {
    const childId = log.child_id;
    const childName = log.child?.name || `Child ${childId}`;
    const hours = Number(log.hours) || 0;
    
    if (!hoursByChild[childId]) {
      hoursByChild[childId] = { name: childName, hours: 0 };
    }
    hoursByChild[childId].hours += hours;
  });
  
  // Convert to array format
  return Object.entries(hoursByChild).map(([childId, data]) => ({
    project_id: projectId,
    child_id: Number(childId),
    child_name: data.name,
    total_hours: Number(data.hours.toFixed(2)),
  }));
}

/**
 * Get statistics for all projects with hours per child
 */
export async function getAllProjectsStatistics(): Promise<{ [projectId: number]: ProjectStatistics }> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('work_logs')
    .select(`
      project_id,
      child_id,
      hours,
      child:children(id, name)
    `)
    .eq('status', 'approved'); // Only count approved work logs
  
  if (error) {
    throw new Error(`Failed to fetch project statistics: ${error.message}`);
  }
  
  // Group by project and child
  const stats: { [projectId: number]: { [childId: number]: { name: string; hours: number } } } = {};
  
  (data || []).forEach((log: any) => {
    const projectId = log.project_id;
    const childId = log.child_id;
    const childName = log.child?.name || `Child ${childId}`;
    const hours = Number(log.hours) || 0;
    
    if (!stats[projectId]) {
      stats[projectId] = {};
    }
    if (!stats[projectId][childId]) {
      stats[projectId][childId] = { name: childName, hours: 0 };
    }
    stats[projectId][childId].hours += hours;
  });
  
  // Convert to the expected format
  const result: { [projectId: number]: ProjectStatistics } = {};
  
  Object.entries(stats).forEach(([projectId, children]) => {
    const childHours: ProjectChildHours[] = Object.entries(children).map(([childId, data]) => ({
      project_id: Number(projectId),
      child_id: Number(childId),
      child_name: data.name,
      total_hours: Number(data.hours.toFixed(2)),
    }));
    
    const totalHours = childHours.reduce((sum, ch) => sum + ch.total_hours, 0);
    
    result[Number(projectId)] = {
      project_id: Number(projectId),
      child_hours: childHours,
      total_hours: Number(totalHours.toFixed(2)),
    };
  });
  
  return result;
}

