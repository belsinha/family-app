import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ChoreHouseholdMember, type ChoreTaskInstance } from '../../utils/api';
import { findHouseholdMemberForChildName } from './choreMemberMatch';

interface ChildChoresTeaserProps {
  childName: string;
}

export default function ChildChoresTeaser({ childName }: ChildChoresTeaserProps) {
  const navigate = useNavigate();
  const [member, setMember] = useState<ChoreHouseholdMember | null | undefined>(undefined);
  const [instances, setInstances] = useState<ChoreTaskInstance[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.getHouseholdMembers();
        if (cancelled) return;
        const m = findHouseholdMemberForChildName(list, childName);
        if (!m) {
          setMember(null);
          setInstances([]);
          return;
        }
        setMember(m);
        const today = new Date().toISOString().slice(0, 10);
        const tasks = await api.getTasksToday({ date: today, userId: m.id });
        if (!cancelled) setInstances(tasks);
      } catch {
        if (!cancelled) {
          setMember(null);
          setInstances([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [childName]);

  if (member === undefined) return null;
  if (member === null) return null;
  if (instances === null) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-teal-100">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Casa Organizada</h3>
        <p className="text-sm text-gray-500">Loading your tasks…</p>
      </div>
    );
  }

  const pending = instances.filter((i) => i.status !== 'DONE');
  const done = instances.length - pending.length;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-teal-100">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">Casa Organizada</h3>
          <p className="text-sm text-gray-500">
            Your tasks today: {pending.length} to go
            {instances.length > 0 ? ` · ${done} done` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/chores?member=${member.id}`)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors text-sm shrink-0"
        >
          Open tasks
        </button>
      </div>
      {pending.length === 0 && instances.length > 0 && (
        <p className="text-sm text-green-700 font-medium">All caught up for today.</p>
      )}
      {pending.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          {pending.slice(0, 5).map((i) => (
            <li key={i.id} className="flex gap-2">
              <span className="text-gray-400 shrink-0">•</span>
              <span>{i.template.name}</span>
            </li>
          ))}
        </ul>
      )}
      {instances.length === 0 && (
        <p className="text-sm text-gray-600 mt-2">Nothing scheduled for you today.</p>
      )}
      {pending.length > 5 && (
        <p className="text-xs text-gray-500 mt-2">+{pending.length - 5} more in full view</p>
      )}
    </div>
  );
}
