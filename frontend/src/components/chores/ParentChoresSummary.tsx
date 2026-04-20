import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ChoreTaskInstance } from '../../utils/api';

interface ParentChoresSummaryProps {
  childNames: string[];
}

export default function ParentChoresSummary({ childNames }: ParentChoresSummaryProps) {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<ChoreTaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setLoading(true);
    setError(null);
    api
      .getTasksToday({ date: today })
      .then(setInstances)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load tasks'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm mb-6">
        <p className="text-sm text-gray-600">Loading home tasks…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm mb-6">
        <p className="text-sm text-amber-900 font-medium">Casa Organizada</p>
        <p className="text-sm text-amber-800 mt-1">{error}</p>
      </div>
    );
  }

  const done = instances.filter((i) => i.status === 'DONE').length;
  const total = instances.length;
  const pending = total - done;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Casa Organizada</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Today: {total} task{total !== 1 ? 's' : ''} · {done} done · {pending} left
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/chores')}
          className="text-sm font-medium text-blue-700 hover:text-blue-900 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
        >
          Open full view
        </button>
      </div>
      {childNames.length > 0 && (
        <ul className="space-y-2 text-sm border-t border-gray-100 pt-4">
          {childNames.map((name) => {
            const nameLc = name.trim().toLowerCase();
            const theirs = instances.filter((i) => {
              const assigneeMatch =
                i.assignedTo?.name && i.assignedTo.name.trim().toLowerCase() === nameLc;
              const liabilityMatch =
                i.allowanceLiabilityMember?.name &&
                i.allowanceLiabilityMember.name.trim().toLowerCase() === nameLc &&
                i.assignedToId == null &&
                Boolean(i.template.anyoneMayComplete);
              return assigneeMatch || liabilityMatch;
            });
            if (theirs.length === 0) return null;
            const theirDone = theirs.filter((i) => i.status === 'DONE').length;
            const theirPending = theirs.length - theirDone;
            const row0 = theirs[0];
            const memberId =
              row0?.assignedTo?.id ??
              (row0?.allowanceLiabilityMemberId != null ? row0.allowanceLiabilityMemberId : undefined);
            return (
              <li key={name} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-gray-700">
                  <span className="font-medium">{name}</span>
                  <span className="text-gray-500">
                    {' '}
                    — {theirPending} left of {theirs.length}
                  </span>
                </span>
                {memberId != null && (
                  <button
                    type="button"
                    onClick={() => navigate(`/chores?member=${memberId}`)}
                    className="text-blue-700 hover:text-blue-900 underline text-xs font-medium"
                  >
                    Their tasks
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {total === 0 && (
        <p className="text-sm text-gray-600 border-t border-gray-100 pt-4">No tasks scheduled for today.</p>
      )}
    </div>
  );
}
