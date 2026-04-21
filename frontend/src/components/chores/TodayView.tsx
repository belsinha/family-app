import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  api,
  type ChoreTaskInstance,
  type ChoreHouseholdMember,
  type ChoreCategory,
} from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  CHORE_HOUSE_AREAS,
  CHORE_HOUSE_AREA_LABELS,
  normalizeHouseArea,
  type ChoreHouseAreaCode,
} from '../../constants/choreHouseArea';

const TIME_ORDER = ['MORNING', 'AFTERNOON', 'NIGHT', 'ANY'];

function excuseOf(i: ChoreTaskInstance): string {
  return i.excuseStatus ?? 'NONE';
}

function groupByTimeBlock(instances: ChoreTaskInstance[]): Map<string, ChoreTaskInstance[]> {
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

function isPoolOpen(inst: ChoreTaskInstance): boolean {
  return Boolean(inst.template.anyoneMayComplete) && inst.assignedToId == null;
}

function defaultPoolCompleter(
  inst: ChoreTaskInstance,
  childMembers: ChoreHouseholdMember[],
  selectedUserId: number | null
): number | undefined {
  if (childMembers.length === 0) return undefined;
  if (selectedUserId != null && childMembers.some((m) => m.id === selectedUserId)) {
    return selectedUserId;
  }
  if (
    inst.allowanceLiabilityMemberId != null &&
    childMembers.some((m) => m.id === inst.allowanceLiabilityMemberId)
  ) {
    return inst.allowanceLiabilityMemberId;
  }
  return childMembers[0].id;
}

interface TodayViewProps {
  selectedUserId: number | null;
  members: ChoreHouseholdMember[];
}

export default function TodayView({ selectedUserId, members }: TodayViewProps) {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const childMembers = useMemo(() => members.filter((m) => !m.canEditChores), [members]);

  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [instances, setInstances] = useState<ChoreTaskInstance[]>([]);
  const [categories, setCategories] = useState<ChoreCategory[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<number | 'all'>('all');
  const [houseAreaFilter, setHouseAreaFilter] = useState<ChoreHouseAreaCode | 'all'>('all');
  const [pendingExcuses, setPendingExcuses] = useState<ChoreTaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excuseModalInst, setExcuseModalInst] = useState<ChoreTaskInstance | null>(null);
  const [excuseNote, setExcuseNote] = useState('');
  const [excuseBusy, setExcuseBusy] = useState(false);
  const [excuseErr, setExcuseErr] = useState<string | null>(null);
  const [parentPoolCompleter, setParentPoolCompleter] = useState<Record<number, number>>({});
  const [parentPoolWithoutReminder, setParentPoolWithoutReminder] = useState<Record<number, boolean>>({});

  const loadPendingExcuses = useCallback(async () => {
    if (!isParent) return;
    try {
      const list = await api.getPendingChoreExcuses();
      setPendingExcuses(list);
    } catch {
      setPendingExcuses([]);
    }
  }, [isParent]);

  useEffect(() => {
    api.getChoreCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    void loadPendingExcuses();
  }, [loadPendingExcuses, date]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTasksToday({ date, userId: selectedUserId ?? undefined })
      .then(setInstances)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [date, selectedUserId]);

  const filteredInstances = useMemo(() => {
    return instances.filter((i) => {
      if (categoryFilterId !== 'all' && i.template.categoryId !== categoryFilterId) return false;
      if (houseAreaFilter !== 'all' && normalizeHouseArea(i.template.houseArea) !== houseAreaFilter) {
        return false;
      }
      return true;
    });
  }, [instances, categoryFilterId, houseAreaFilter]);

  const refreshAfterExcuseDecision = async () => {
    await loadPendingExcuses();
    try {
      const list = await api.getTasksToday({ date, userId: selectedUserId ?? undefined });
      setInstances(list);
    } catch {
      /* ignore */
    }
  };

  const complete = async (id: number, doneWithoutReminder: boolean, completedByMemberId?: number) => {
    try {
      const updated = await api.completeTask(id, doneWithoutReminder, completedByMemberId);
      setInstances((prev) =>
        prev.map((i) => (i.id === id ? updated : i))
      );
      void loadPendingExcuses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete');
    }
  };

  const setAllowanceLiability = async (instanceId: number, householdMemberId: number) => {
    setError(null);
    try {
      const updated = await api.setTaskAllowanceLiability(instanceId, householdMemberId);
      setInstances((prev) => prev.map((i) => (i.id === instanceId ? updated : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update allowance liability');
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

  const openExcuseModal = (inst: ChoreTaskInstance) => {
    setExcuseErr(null);
    setExcuseNote(inst.excuseNote && excuseOf(inst) === 'REJECTED' ? inst.excuseNote : '');
    setExcuseModalInst(inst);
  };

  const submitExcuse = async () => {
    if (!excuseModalInst) return;
    setExcuseBusy(true);
    setExcuseErr(null);
    try {
      const updated = await api.submitChoreExcuseRequest(excuseModalInst.id, excuseNote);
      setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setExcuseModalInst(null);
      void loadPendingExcuses();
    } catch (e) {
      setExcuseErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setExcuseBusy(false);
    }
  };

  const decideExcuse = async (instanceId: number, action: 'approve' | 'reject') => {
    setError(null);
    try {
      await api.decideChoreExcuse(instanceId, action);
      await refreshAfterExcuseDecision();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update excuse');
    }
  };

  if (loading) return <p className="text-gray-600">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const byBlock = groupByTimeBlock(filteredInstances);
  const blockLabels: Record<string, string> = {
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    NIGHT: 'Night',
    ANY: 'Anytime',
  };

  const hasAnyBlock = TIME_ORDER.some((block) => (byBlock.get(block) || []).length > 0);

  const canRequestExcuse = (inst: ChoreTaskInstance) => {
    if (inst.status === 'DONE') return false;
    const ex = excuseOf(inst);
    return ex === 'NONE' || ex === 'REJECTED';
  };

  return (
    <div className="space-y-4">
      {isParent && pendingExcuses.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
          <h3 className="font-semibold text-amber-950">Pending allowance excuses</h3>
          <p className="mt-1 text-xs text-amber-900">
            Approve to remove the chore from allowance math for that month (child still sees the task). Reject to keep
            it counting.
          </p>
          <ul className="mt-3 space-y-3">
            {pendingExcuses.map((inst) => (
              <li
                key={inst.id}
                className="rounded-md border border-amber-100 bg-white p-3 text-gray-900 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{inst.template.name}</p>
                    <p className="text-xs text-gray-600">
                      {isPoolOpen(inst)
                        ? inst.allowanceLiabilityMember?.name
                          ? `Anyone · if missed: ${inst.allowanceLiabilityMember.name}`
                          : 'Anyone (household)'
                        : inst.assignedTo?.name}
                      {' · '}
                      {inst.taskDate}
                    </p>
                    <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{inst.excuseNote}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void decideExcuse(inst.id, 'approve')}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideExcuse(inst.id, 'reject')}
                      className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 rounded border border-gray-300 px-2 py-1"
          />
        </div>
        {categories.length > 0 && (
          <div>
            <label htmlFor="today-cat" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="today-cat"
              value={categoryFilterId === 'all' ? 'all' : String(categoryFilterId)}
              onChange={(e) => {
                const v = e.target.value;
                setCategoryFilterId(v === 'all' ? 'all' : parseInt(v, 10));
              }}
              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="today-area" className="block text-sm font-medium text-gray-700">
            House area
          </label>
          <select
            id="today-area"
            value={houseAreaFilter}
            onChange={(e) =>
              setHouseAreaFilter(e.target.value === 'all' ? 'all' : (e.target.value as ChoreHouseAreaCode))
            }
            className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm min-w-[11rem]"
          >
            <option value="all">All areas</option>
            {CHORE_HOUSE_AREAS.map((code) => (
              <option key={code} value={code}>
                {CHORE_HOUSE_AREA_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!hasAnyBlock && (
        <p className="text-sm text-gray-600">
          {instances.length === 0
            ? 'No tasks scheduled for this day.'
            : 'No tasks match the selected filters for this day.'}
        </p>
      )}
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
                const ex = excuseOf(inst);
                const pool = isPoolOpen(inst);
                const showParentPoolComplete =
                  isParent && pool && inst.status === 'PENDING' && available;
                const completerDefault = defaultPoolCompleter(inst, childMembers, selectedUserId);
                const completerId = parentPoolCompleter[inst.id] ?? completerDefault;
                return (
                  <li
                    key={inst.id}
                    className="flex flex-wrap items-center gap-2 rounded bg-white p-2 shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={inst.status === 'DONE'}
                      disabled={!available || showParentPoolComplete}
                      onChange={() => {
                        if (inst.status === 'DONE') return;
                        if (showParentPoolComplete) return;
                        void complete(inst.id, false);
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
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {inst.template.category.name}
                    </span>
                    {normalizeHouseArea(inst.template.houseArea) !== 'NONE' && (
                      <span
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                        title="House area"
                      >
                        {CHORE_HOUSE_AREA_LABELS[normalizeHouseArea(inst.template.houseArea)]}
                      </span>
                    )}
                    {pool ? (
                      <span className="text-sm text-gray-500">(Anyone)</span>
                    ) : (
                      inst.assignedTo && (
                        <span className="text-sm text-gray-500">
                          ({inst.assignedTo.name})
                        </span>
                      )
                    )}
                    {pool && inst.allowanceLiabilityMember && inst.status === 'PENDING' && (
                      <span className="text-xs text-gray-500">
                        If missed: {inst.allowanceLiabilityMember.name}&apos;s allowance
                      </span>
                    )}
                    {ex === 'PENDING' && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                        Excuse pending
                      </span>
                    )}
                    {ex === 'APPROVED' && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-900">
                        Excused (allowance)
                      </span>
                    )}
                    {ex === 'REJECTED' && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-900">
                        Excuse not approved
                      </span>
                    )}
                    {inst.availableAfter && !available && (
                      <span className="text-xs text-amber-600">
                        After {inst.availableAfter}
                      </span>
                    )}
                    {isParent && pool && inst.status === 'PENDING' && available && childMembers.length > 0 && (
                      <label className="flex flex-wrap items-center gap-1 text-xs text-gray-700">
                        <span className="shrink-0">If missed, counts against</span>
                        <select
                          className="max-w-[10rem] rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                          value={inst.allowanceLiabilityMemberId ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') return;
                            const n = parseInt(v, 10);
                            if (Number.isNaN(n)) return;
                            void setAllowanceLiability(inst.id, n);
                          }}
                        >
                          <option value="">Choose child…</option>
                          {childMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {showParentPoolComplete &&
                      (completerId != null ? (
                        <span className="flex flex-wrap items-center gap-2 border-l border-gray-200 pl-2 text-xs text-gray-800">
                          <span className="shrink-0 text-gray-600">Mark done as</span>
                          <select
                            className="max-w-[10rem] rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                            value={completerId}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (Number.isNaN(n)) return;
                              setParentPoolCompleter((prev) => ({ ...prev, [inst.id]: n }));
                            }}
                          >
                            {childMembers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={parentPoolWithoutReminder[inst.id] === true}
                              onChange={(e) =>
                                setParentPoolWithoutReminder((prev) => ({
                                  ...prev,
                                  [inst.id]: e.target.checked,
                                }))
                              }
                            />
                            No reminder (+2 pts)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              void complete(
                                inst.id,
                                parentPoolWithoutReminder[inst.id] === true,
                                completerId
                              )
                            }
                            className="rounded bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-700"
                          >
                            Mark done
                          </button>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700">Add child members to mark this shared task done.</span>
                      ))}
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
                    {canRequestExcuse(inst) && (
                      <button
                        type="button"
                        onClick={() => openExcuseModal(inst)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Request allowance excuse…
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {excuseModalInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Allowance excuse</h3>
            <p className="mt-1 text-sm text-gray-600">
              Explain why you could not do &quot;{excuseModalInst.template.name}&quot; ({excuseModalInst.taskDate}). A
              parent will review this; if approved, this chore will not reduce your monthly allowance.
            </p>
            <textarea
              className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              value={excuseNote}
              onChange={(e) => setExcuseNote(e.target.value)}
              placeholder="e.g. Sick at home, away for school trip…"
            />
            {excuseErr && <p className="mt-2 text-sm text-red-700">{excuseErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExcuseModalInst(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={excuseBusy || excuseNote.trim().length < 3}
                onClick={() => void submitExcuse()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {excuseBusy ? 'Sending…' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
