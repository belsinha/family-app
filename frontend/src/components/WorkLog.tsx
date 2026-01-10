import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { WorkLog, AddWorkLogRequest } from '../../../shared/src/types';

interface WorkLogProps {
  childId: number;
  childName: string;
  onClose: () => void;
  onCreate?: () => void;
}

export default function WorkLog({ childId, childName, onClose, onCreate }: WorkLogProps) {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [hours, setHours] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadWorkLogs();
  }, [childId]);

  const loadWorkLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const logs = await api.getWorkLogsByChildId(childId);
      setWorkLogs(logs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load work logs';
      setError(message);
      console.error('Error loading work logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const hoursNum = parseFloat(hours);
    if (!hours || isNaN(hoursNum) || hoursNum <= 0) {
      setFormError('Hours must be a positive number');
      return;
    }

    if (!description.trim()) {
      setFormError('Description cannot be empty');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: AddWorkLogRequest = {
        childId,
        hours: hoursNum,
        description: description.trim(),
        workDate: workDate || undefined,
      };
      
      await api.addWorkLog(data);
      
      // Reset form
      setHours('');
      setDescription('');
      setWorkDate(new Date().toISOString().split('T')[0]);
      setIsCreating(false);
      
      // Reload work logs
      await loadWorkLogs();
      
      // Notify parent component
      if (onCreate) {
        onCreate();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create work log';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Work Log - {childName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Create new work log button */}
          {!isCreating && (
            <div className="mb-6">
              <button
                onClick={() => setIsCreating(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                + Add Work Log
              </button>
            </div>
          )}

          {/* Create form */}
          {isCreating && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">New Work Log Entry</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hours Worked *
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2.5"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Short description of the work performed"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{formError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Work Log'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setFormError(null);
                      setHours('');
                      setDescription('');
                      setWorkDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Work logs list */}
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading work logs...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            </div>
          ) : workLogs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No work logs recorded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-lg border bg-blue-50 border-blue-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-lg text-blue-700">
                          {Number(log.hours)} hour{Number(log.hours) !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-800">
                          {new Date(log.work_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{log.description}</p>
                      <p className="text-xs text-gray-500">
                        Logged on {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

