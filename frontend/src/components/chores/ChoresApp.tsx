import { useState, useEffect } from 'react';
import { api, type ChoreHouseholdMember } from '../../utils/api';
import TodayView from './TodayView';
import WeekView from './WeekView';
import TemplatesView from './TemplatesView';
import HistoryView from './HistoryView';

type Tab = 'today' | 'week' | 'templates' | 'history';

export default function ChoresApp() {
  const [members, setMembers] = useState<ChoreHouseholdMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getHouseholdMembers()
      .then((list) => {
        setMembers(list);
        if (list.length > 0 && selectedUserId === null) {
          setSelectedUserId(list[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-4 text-gray-600">Loading...</p>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'templates', label: 'Templates' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Casa Organizada
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-gray-700">
            View as
          </label>
          <select
            value={selectedUserId ?? ''}
            onChange={(e) =>
              setSelectedUserId(
                e.target.value ? parseInt(e.target.value, 10) : null
              )
            }
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.canEditChores ? ' (can edit chores)' : ''}
              </option>
            ))}
          </select>
        </div>
      </header>
      <nav className="mb-4 flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="rounded-lg bg-white p-4 shadow">
        {tab === 'today' && (
          <TodayView
            selectedUserId={selectedUserId}
            members={members}
          />
        )}
        {tab === 'week' && <WeekView />}
        {tab === 'templates' && (
          <TemplatesView
            selectedUserId={selectedUserId}
            members={members}
          />
        )}
        {tab === 'history' && <HistoryView />}
      </main>
    </div>
  );
}
