import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type ChoreHouseholdMember } from '../../utils/api';
import TodayView from './TodayView';
import WeekView from './WeekView';
import TemplatesView from './TemplatesView';
import HistoryView from './HistoryView';

type Tab = 'today' | 'week' | 'templates' | 'history';

function parseTab(value: string | null): Tab | null {
  if (value === 'today' || value === 'week' || value === 'templates' || value === 'history') {
    return value;
  }
  return null;
}

export default function ChoresApp() {
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState<ChoreHouseholdMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [loading, setLoading] = useState(true);
  const appliedInitialView = useRef(false);

  useEffect(() => {
    api
      .getHouseholdMembers()
      .then((list) => {
        setMembers(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (members.length === 0) return;

    const mid = searchParams.get('member');
    if (mid) {
      const id = parseInt(mid, 10);
      if (!Number.isNaN(id) && members.some((m) => m.id === id)) {
        setSelectedUserId(id);
        appliedInitialView.current = true;
      } else if (!appliedInitialView.current) {
        setSelectedUserId(members[0].id);
        appliedInitialView.current = true;
      }
    } else if (!appliedInitialView.current) {
      setSelectedUserId(members[0].id);
      appliedInitialView.current = true;
    }

    const t = parseTab(searchParams.get('tab'));
    if (t) setTab(t);
  }, [members, searchParams]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading Casa Organizada…</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'templates', label: 'Templates' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Casa Organizada</h2>
          <p className="text-sm text-gray-500 mt-1">
            Today&apos;s tasks, weekly scores, and templates — same household as the family app above.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="chores-view-as" className="text-sm font-medium text-gray-700">
            View as
          </label>
          <select
            id="chores-view-as"
            value={selectedUserId ?? ''}
            onChange={(e) =>
              setSelectedUserId(
                e.target.value ? parseInt(e.target.value, 10) : null
              )
            }
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
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
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium rounded-t-md ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="rounded-lg bg-white p-6 shadow-md border border-gray-100">
        {tab === 'today' && (
          <TodayView selectedUserId={selectedUserId} members={members} />
        )}
        {tab === 'week' && <WeekView />}
        {tab === 'templates' && (
          <TemplatesView selectedUserId={selectedUserId} members={members} />
        )}
        {tab === 'history' && <HistoryView />}
      </div>
    </div>
  );
}
