import { useState, useEffect } from 'react';
import { api, type ChoreTemplate, type ChoreHouseholdMember } from '../../utils/api';

interface TemplatesViewProps {
  selectedUserId: number | null;
  members: ChoreHouseholdMember[];
}

export default function TemplatesView({ selectedUserId, members }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = members.find((m) => m.id === selectedUserId)?.canEditChores ?? false;

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTemplates()
      .then(setTemplates)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-600">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          Only Celiane can edit task templates. Select Celiane in the user selector to add or edit.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-b border-gray-200 px-2 py-2 text-left">Name</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Category</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Assigned</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Frequency</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Time</th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">Points</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="px-2 py-2">{t.name}</td>
                <td className="px-2 py-2">{t.category}</td>
                <td className="px-2 py-2">{t.assignedTo?.name ?? '-'}</td>
                <td className="px-2 py-2">
                  {t.frequencyType}
                  {t.dayOfWeek != null && ` (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.dayOfWeek]})`}
                  {t.weekOfMonth != null && ` wk${t.weekOfMonth}`}
                  {t.conditionalAfterTime && ` after ${t.conditionalAfterTime}`}
                </td>
                <td className="px-2 py-2">{t.timeBlock}</td>
                <td className="px-2 py-2">{t.pointsBase}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
