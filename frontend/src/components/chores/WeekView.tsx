import { useState, useEffect } from 'react';
import { api, type ChoreWeeklySummary } from '../../utils/api';

function getMonday(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

export default function WeekView() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [summary, setSummary] = useState<ChoreWeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getWeeklySummary(weekStart)
      .then(setSummary)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load')
      )
      .finally(() => setLoading(false));
  }, [weekStart]);

  if (loading) return <p className="text-gray-600">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!summary) return null;

  const colorClass = (c: string) => {
    if (c === 'green') return 'text-green-700 bg-green-100';
    if (c === 'yellow') return 'text-yellow-800 bg-yellow-100';
    return 'text-red-700 bg-red-100';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">
          Week starting (Monday)
        </label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </div>
      <p className="text-sm text-gray-500">
        {summary.weekStart} – {summary.weekEnd}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {summary.byUser.map((row) => (
          <div
            key={row.member.id}
            className="rounded border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-gray-900">
                {row.member.name}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-sm font-medium ${colorClass(row.classification)}`}
              >
                {row.totalPoints} pts – {row.classification}
              </span>
            </div>
            {row.missed.length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <p className="text-xs font-medium text-gray-600">
                  Missed tasks
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
                  {row.missed.map((m) => (
                    <li key={m.id}>
                      {m.template.name} ({m.taskDate})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
