import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { WorkLog } from '../../../shared/src/types';

interface PendingWorkLog extends WorkLog {
  child?: { id: number; name: string } | null;
}

export default function WorkLogApproval() {
  const [pendingLogs, setPendingLogs] = useState<PendingWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  useEffect(() => {
    loadPendingLogs();
  }, []);

  const loadPendingLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const logs = await api.getPendingWorkLogs() as PendingWorkLog[];
      setPendingLogs(logs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pending work logs';
      setError(message);
      console.error('Error loading pending work logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (workLogId: number, action: 'approve' | 'decline') => {
    setApprovingId(workLogId);
    try {
      await api.approveWorkLog(workLogId, action);
      await loadPendingLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action} work log`;
      alert(message);
      console.error(`Error ${action}ing work log:`, err);
    } finally {
      setApprovingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading pending work logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Pending Work Log Approvals</h2>
        <button
          onClick={loadPendingLogs}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {pendingLogs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600">No pending work logs to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingLogs.map((log) => {
            const project = log.project;
            const bonusPoints = project ? Math.floor(log.hours * project.bonus_rate) : 0;
            
            return (
              <div
                key={log.id}
                className="p-4 rounded-lg border border-yellow-200 bg-yellow-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-semibold text-lg text-gray-900">
                        {Number(log.hours)} hour{Number(log.hours) !== 1 ? 's' : ''}
                      </span>
                      {project && (
                        <>
                          <span className="text-xs px-2 py-1 rounded bg-purple-200 text-purple-800">
                            {project.name}
                          </span>
                          <span className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-800">
                            {project.bonus_rate} pts/hour
                          </span>
                          {bonusPoints > 0 && (
                            <span className="text-xs px-2 py-1 rounded bg-green-200 text-green-800 font-semibold">
                              {bonusPoints} bonus points
                            </span>
                          )}
                        </>
                      )}
                      <span className="text-xs px-2 py-1 rounded bg-yellow-200 text-yellow-800">
                        {new Date(log.work_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{log.description}</p>
                    <div className="text-xs text-gray-500">
                      <p>{log.child ? `Child: ${log.child.name}` : `Child ID: ${log.child_id}`}</p>
                      <p>Logged on: {new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleApprove(log.id, 'approve')}
                      disabled={approvingId === log.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {approvingId === log.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleApprove(log.id, 'decline')}
                      disabled={approvingId === log.id}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {approvingId === log.id ? 'Processing...' : 'Decline'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

