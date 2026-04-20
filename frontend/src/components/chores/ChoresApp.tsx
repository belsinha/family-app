import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, type ChoreHouseholdMember } from '../../utils/api';
import { findChoreEditorMember } from './choreMemberMatch';
import TodayView from './TodayView';
import WeekView from './WeekView';
import TemplatesView from './TemplatesView';
import HistoryView from './HistoryView';
import AllowanceView from './AllowanceView';

type Tab = 'today' | 'week' | 'templates' | 'history' | 'allowance';

function parseTab(value: string | null): Tab | null {
  if (
    value === 'today' ||
    value === 'week' ||
    value === 'templates' ||
    value === 'history' ||
    value === 'allowance'
  ) {
    return value;
  }
  return null;
}

export default function ChoresApp() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  /** Non-parents use ChildView but must not get the parent chores UI (same as API scope). */
  const isChoresSelfOnly = user?.role !== 'parent';
  const [members, setMembers] = useState<ChoreHouseholdMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const appliedInitialView = useRef(false);

  const memberFromUrl = searchParams.get('member');
  const tabFromUrl = searchParams.get('tab');

  useEffect(() => {
    setLoadError(null);
    api
      .getHouseholdMembers()
      .then((list) => {
        setMembers(list);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load household members';
        setLoadError(msg);
        console.error(e);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (members.length === 0) return;

    if (isChoresSelfOnly) {
      setSelectedUserId(members[0].id);
      appliedInitialView.current = true;
      setTab('today');
    } else {
      const mid = memberFromUrl;
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

      const t = parseTab(tabFromUrl);
      if (t) setTab(t);
    }
  }, [members, memberFromUrl, tabFromUrl, isChoresSelfOnly]);

  const editorMemberId = useMemo(() => {
    if (!user?.name || members.length === 0) return null;
    return findChoreEditorMember(members, user.name)?.id ?? null;
  }, [user?.name, members]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading Casa Organizada…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
        <h2 className="text-lg font-semibold text-red-950">Could not load Casa Organizada</h2>
        <p className="mt-2 text-sm">{loadError}</p>
        <p className="mt-3 text-sm text-red-800">
          If you see &quot;404&quot;, the app may be calling the wrong API address. For the combined Render
          deploy, clear <code className="rounded bg-red-100 px-1">VITE_API_URL</code> so the client uses{' '}
          <code className="rounded bg-red-100 px-1">/api</code> on the same host. If you set{' '}
          <code className="rounded bg-red-100 px-1">VITE_API_URL</code>, it must end with{' '}
          <code className="rounded bg-red-100 px-1">/api</code> (e.g. <code className="rounded bg-red-100 px-1">https://your-service.onrender.com/api</code>
          ).
        </p>
      </div>
    );
  }

  if (isChoresSelfOnly && members.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h2 className="text-lg font-semibold text-amber-950">Casa Organizada</h2>
        <p className="mt-2 text-sm">
          No household tasks are linked to your account. If you think this is a mistake, ask a parent
          to check that your login name matches your name in the chore list.
        </p>
      </div>
    );
  }

  const allTabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'templates', label: 'Templates' },
    { id: 'history', label: 'History' },
    { id: 'allowance', label: 'Allowance' },
  ];
  const tabs = isChoresSelfOnly ? allTabs.filter((t) => t.id === 'today') : allTabs;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Casa Organizada</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isChoresSelfOnly
              ? 'Your tasks for today — only you can see this list.'
              : "Today's tasks, weekly scores, and templates for the whole household."}
          </p>
        </div>
        {!isChoresSelfOnly && (
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
        )}
      </div>

      {!isChoresSelfOnly && (
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
      )}

      <div className="rounded-lg bg-white p-6 shadow-md border border-gray-100">
        {tab === 'today' && (
          <TodayView
            selectedUserId={isChoresSelfOnly ? null : selectedUserId}
            members={members}
          />
        )}
        {!isChoresSelfOnly && tab === 'week' && <WeekView />}
        {!isChoresSelfOnly && tab === 'templates' && (
          <TemplatesView members={members} editorMemberId={editorMemberId} />
        )}
        {!isChoresSelfOnly && tab === 'history' && <HistoryView />}
        {!isChoresSelfOnly && tab === 'allowance' && <AllowanceView />}
      </div>
    </div>
  );
}
