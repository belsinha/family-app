import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { Project, CreateProjectRequest, UpdateProjectRequest, ProjectStatistics } from '../../../shared/src/types';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStats, setProjectStats] = useState<{ [projectId: number]: ProjectStatistics }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  
  // Form state for create
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bonusRate, setBonusRate] = useState<string>('1');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  
  // Form state for edit
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editBonusRate, setEditBonusRate] = useState<string>('1');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [projectsData, statsData] = await Promise.all([
        api.getProjects(),
        api.getProjectStatistics().catch(() => ({})), // Don't fail if stats fail
      ]);
      setProjects(projectsData);
      setProjectStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
      console.error('Error loading projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Project name is required');
      return;
    }

    const rate = parseFloat(bonusRate);
    if (isNaN(rate) || rate < 0) {
      setFormError('Bonus rate must be a non-negative number');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: CreateProjectRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate: endDate.trim() || undefined,
        bonusRate: rate,
        status,
      };
      
      await api.createProject(data);
      
      // Reset form
      setName('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setBonusRate('1');
      setStatus('active');
      setIsCreating(false);
      
      // Reload projects and statistics
      await loadProjects();
    } catch (err) {
      console.error('Error creating project:', err);
      const message = err instanceof Error ? err.message : 'Failed to create project';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProjectId(project.id);
    setEditName(project.name);
    setEditDescription(project.description || '');
    setEditStartDate(project.start_date);
    setEditEndDate(project.end_date || '');
    setEditBonusRate(String(project.bonus_rate));
    setEditStatus(project.status);
    setFormError(null);
  };

  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditName('');
    setEditDescription('');
    setEditStartDate('');
    setEditEndDate('');
    setEditBonusRate('1');
    setEditStatus('active');
    setFormError(null);
  };

  const handleUpdate = async (e: React.FormEvent, projectId: number) => {
    e.preventDefault();
    setFormError(null);

    if (!editName.trim()) {
      setFormError('Project name is required');
      return;
    }

    const rate = parseFloat(editBonusRate);
    if (isNaN(rate) || rate < 0) {
      setFormError('Bonus rate must be a non-negative number');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: UpdateProjectRequest = {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        startDate: editStartDate,
        endDate: editEndDate.trim() || undefined,
        bonusRate: rate,
        status: editStatus,
      };
      
      await api.updateProject(projectId, data);
      
      // Reset edit form
      handleCancelEdit();
      
      // Reload projects and statistics
      await loadProjects();
    } catch (err) {
      console.error('Error updating project:', err);
      const message = err instanceof Error ? err.message : 'Failed to update project';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (projectId: number) => {
    if (!confirm('Are you sure you want to delete/deactivate this project?')) {
      return;
    }

    try {
      await api.deleteProject(projectId);
      // Reload projects and statistics
      await loadProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      alert(message);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Projects</h2>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto sm:py-2"
          >
            + Create Project
          </button>
        )}
      </div>

      {error && !formError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {isCreating && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Create New Project</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date (optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onInput={(e) => setEndDate((e.target as HTMLInputElement).value)}
                  onBlur={(e) => setEndDate((e.target as HTMLInputElement).value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bonus Rate (points per hour) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={bonusRate}
                onChange={(e) => setBonusRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">{formError}</p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setFormError(null);
                  setName('');
                  setDescription('');
                  setStartDate('');
                  setEndDate('');
                  setBonusRate('1');
                  setStatus('active');
                }}
                className="w-full rounded-lg bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300 sm:w-auto sm:py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto sm:py-2"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 && !isCreating ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600">No projects found. Create your first project to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`rounded-lg border p-4 sm:p-5 ${
                project.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              {editingProjectId === project.id ? (
                <form onSubmit={(e) => handleUpdate(e, project.id)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date (optional)
                      </label>
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        onInput={(e) => setEditEndDate((e.target as HTMLInputElement).value)}
                        onBlur={(e) => setEditEndDate((e.target as HTMLInputElement).value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bonus Rate (points per hour) *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editBonusRate}
                        onChange={(e) => setEditBonusRate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status *
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  {formError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800">{formError}</p>
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSubmitting}
                      className="w-full rounded-lg bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50 sm:w-auto sm:py-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto sm:py-2"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-1 text-xs ${
                            project.status === 'active' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'
                          }`}>
                            {project.status}
                          </span>
                          <span className="rounded bg-purple-200 px-2 py-1 text-xs text-purple-800">
                            {project.bonus_rate} pts/hour
                          </span>
                        </div>
                      </div>
                      {project.description && (
                        <p className="mb-2 text-sm text-gray-700">{project.description}</p>
                      )}
                      <div className="mb-3 flex flex-col gap-1 text-xs text-gray-500 sm:flex-row sm:flex-wrap sm:gap-x-4">
                        <span>Start: {new Date(project.start_date).toLocaleDateString()}</span>
                        {project.end_date && (
                          <span>End: {new Date(project.end_date).toLocaleDateString()}</span>
                        )}
                      </div>
                      
                      {/* Display hours per child */}
                      {projectStats[project.id] && projectStats[project.id].child_hours.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Hours by Child:</h4>
                          <div className="space-y-1">
                            {projectStats[project.id].child_hours.map((childHours) => (
                              <div key={childHours.child_id} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{childHours.child_name}:</span>
                                <span className="font-medium text-gray-900">
                                  {childHours.total_hours} {childHours.total_hours === 1 ? 'hour' : 'hours'}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between text-sm font-semibold pt-2 mt-2 border-t border-gray-300">
                              <span className="text-gray-700">Total:</span>
                              <span className="text-gray-900">
                                {projectStats[project.id].total_hours} {projectStats[project.id].total_hours === 1 ? 'hour' : 'hours'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {projectStats[project.id] && projectStats[project.id].child_hours.length === 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <p className="text-xs text-gray-500">No approved hours logged yet</p>
                        </div>
                      )}
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(project)}
                        className="w-full rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 sm:w-auto sm:px-3 sm:py-1"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(project.id)}
                        className="w-full rounded-lg bg-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-300 sm:w-auto sm:px-3 sm:py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

