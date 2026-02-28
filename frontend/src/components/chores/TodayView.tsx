import { useState, useEffect } from 'react';
import {
  api,
  type ChoreTaskInstance,
  type ChoreHouseholdMember,
} from '../../utils/api';

const TIME_ORDER = ['MORNING', 'AFTERNOON', 'NIGHT', 'ANY'];

function groupByTimeBlock(
  instances: ChoreTaskInstance[]
): Map<string, ChoreTaskInstance[]> {
  const map = new Map<string, ChoreTaskInstance[]>();
  for (const t of instances) {
    const block = t.template.timeBlock || 'ANY';
    if (!map.has(block)) map.set(block, []);
    map.get(block)!.push(t);
  }
  for (const block of TIME_ORDER) {
    if (!map.has(block)) map.set(block, []);
  }
  return map;
}

function isAvailableAfter(availableAfter: string | null): boolean {
  if (!availableAfter) return true;
  const parts = availableAfter.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const afterMins = h * 60 + m;
  return nowMins >= afterMins;
}

interface TodayViewProps {
  selectedUserId: number | null;
  members: ChoreHouseholdMember[];
}

export default function TodayView({ selectedUserId }: TodayViewProps) {
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [instances, setInstances] = useState<ChoreTaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTasksToday({ date, userId: selectedUserId ?? undefined })
      .then(setInstances)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [date, selectedUserId]);

  const complete = async (id: number, doneWithoutReminder: boolean) => {
    try {
      const updated = await api.completeTask(id, doneWithoutReminder);
      setInstances((prev) =>
        prev.map((i) => (i.id === id ? updated : i))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete');
    }
  };

  const miss = async (id: number) => {
    try {
      const updated = await api.missTask(id);
      setInstances((prev) =>
        prev.map((i) => (i.id === id ? updated : i))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark missed');
    }
  };

  if (loading) return <p className="text-gray-600">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const byBlock = groupByTimeBlock(instances);
  const blockLabels: Record<string, string> = {
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    NIGHT: 'Night',
    ANY: 'Anytime',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </div>
      {TIME_ORDER.map((block) => {
        const list = byBlock.get(block) || [];
        if (list.length === 0) return null;
        return (
          <div
            key={block}
            className="rounded border border-gray-200 bg-gray-50 p-3"
          >
            <h3 className="mb-2 font-medium text-gray-800">
              {blockLabels[block] || block}
            </h3>
            <ul className="space-y-2">
              {list.map((inst) => {
                const available = isAvailableAfter(inst.availableAfter);
                return (
                  <li
                    key={inst.id}
                    className="flex flex-wrap items-center gap-2 rounded bg-white p-2 shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={inst.status === 'DONE'}
                      disabled={!available}
                      onChange={() => {
                        if (inst.status === 'DONE') return;
                        complete(inst.id, false);
                      }}
                      className="h-4 w-4"
                    />
                    <span
                      className={
                        inst.status === 'DONE'
                          ? 'text-gray-500 line-through'
                          : ''
                      }
                    >
                      {inst.template.name}
                    </span>
                    {inst.assignedTo && (
                      <span className="text-sm text-gray-500">
                        ({inst.assignedTo.name})
                      </span>
                    )}
                    {inst.availableAfter && !available && (
                      <span className="text-xs text-amber-600">
                        After {inst.availableAfter}
                      </span>
                    )}
                    {inst.status === 'PENDING' && available && (
                      <button
                        type="button"
                        onClick={() => miss(inst.id)}
                        className="text-xs text-red-600 underline"
                      >
                        Mark missed
                      </button>
                    )}
                    {inst.status === 'DONE' && (
                      <span className="text-xs text-green-600">
                        +{inst.doneWithoutReminder ? 2 : 1} pt
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
