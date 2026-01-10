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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Project</h3>
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

            <div className="grid grid-cols-2 gap-4">
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

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
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
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
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
              className={`p-4 rounded-lg border ${
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

                  <div className="grid grid-cols-2 gap-4">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          project.status === 'active' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'
                        }`}>
                          {project.status}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-purple-200 text-purple-800">
                          {project.bonus_rate} pts/hour
                        </span>
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-700 mb-2">{project.description}</p>
                      )}
                      <div className="text-xs text-gray-500 mb-3">
                        <span>Start: {new Date(project.start_date).toLocaleDateString()}</span>
                        {project.end_date && (
                          <span className="ml-4">End: {new Date(project.end_date).toLocaleDateString()}</span>
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(project)}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="px-3 py-1 text-sm bg-red-200 text-red-700 rounded-lg hover:bg-red-300 transition-colors"
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

