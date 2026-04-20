import { useState, useEffect, useMemo } from 'react';
import {
  api,
  type ChoreTemplate,
  type ChoreHouseholdMember,
  type ChoreCategory,
  type ChoreTemplateSavePayload,
} from '../../utils/api';

const FREQUENCY_TYPES = [
  'DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'MONTHLY',
  'SEMIANNUAL',
  'CONDITIONAL_SCHEDULE',
] as const;

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'Every day',
  EVERY_OTHER_DAY: 'Every other day',
  WEEKLY: 'Once a week (pick day)',
  MONTHLY: 'Once a month (pick week 1–4 or day)',
  SEMIANNUAL: 'Twice a year (months as JSON, e.g. Jan & Jul)',
  CONDITIONAL_SCHEDULE: 'On a weekday after a set time (e.g. trash night)',
};

const TIME_BLOCKS = ['MORNING', 'AFTERNOON', 'NIGHT', 'ANY'] as const;

const WEEKDAY_OPTIONS = [
  { v: 0, label: 'Sunday' },
  { v: 1, label: 'Monday' },
  { v: 2, label: 'Tuesday' },
  { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' },
  { v: 5, label: 'Friday' },
  { v: 6, label: 'Saturday' },
];

interface TemplatesViewProps {
  members: ChoreHouseholdMember[];
  editorMemberId: number | null;
}

type Draft = {
  name: string;
  categoryId: number | null;
  assigneeIds: number[];
  anyoneMayComplete: boolean;
  frequencyType: string;
  dayOfWeek: string;
  weekOfMonth: string;
  dayOfMonth: string;
  semiannualMonths: string;
  conditionalDayOfWeek: string;
  conditionalAfterTime: string;
  timeBlock: string;
  pointsBase: string;
  active: boolean;
};

function templateToDraft(t: ChoreTemplate): Draft {
  return {
    name: t.name,
    categoryId: t.categoryId,
    assigneeIds: [...t.assigneeIds],
    anyoneMayComplete: t.anyoneMayComplete === true,
    frequencyType: t.frequencyType,
    dayOfWeek: t.dayOfWeek != null ? String(t.dayOfWeek) : '',
    weekOfMonth: t.weekOfMonth != null ? String(t.weekOfMonth) : '',
    dayOfMonth: t.dayOfMonth != null ? String(t.dayOfMonth) : '',
    semiannualMonths: t.semiannualMonths ?? '',
    conditionalDayOfWeek: t.conditionalDayOfWeek != null ? String(t.conditionalDayOfWeek) : '',
    conditionalAfterTime: t.conditionalAfterTime ?? '',
    timeBlock: t.timeBlock,
    pointsBase: String(t.pointsBase),
    active: t.active,
  };
}

function emptyDraft(categories: ChoreCategory[], members: ChoreHouseholdMember[]): Draft {
  const firstCat = categories[0]?.id ?? null;
  const firstMembers = members.filter((m) => !m.canEditChores).map((m) => m.id);
  const defaultAssignees = firstMembers.length > 0 ? [firstMembers[0]] : members[0]?.id != null ? [members[0].id] : [];
  return {
    name: '',
    categoryId: firstCat,
    assigneeIds: defaultAssignees,
    anyoneMayComplete: false,
    frequencyType: 'DAILY',
    dayOfWeek: '',
    weekOfMonth: '',
    dayOfMonth: '',
    semiannualMonths: '[1,7]',
    conditionalDayOfWeek: '',
    conditionalAfterTime: '',
    timeBlock: 'ANY',
    pointsBase: '1',
    active: true,
  };
}

function parseOptionalInt(s: string): number | null {
  if (s === '') return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function toggleAssignee(ids: number[], id: number, allowEmpty: boolean): number[] {
  if (ids.includes(id)) {
    const next = ids.filter((x) => x !== id);
    if (next.length === 0 && !allowEmpty) return [id];
    return next;
  }
  return [...ids, id].sort((a, b) => a - b);
}

export default function TemplatesView({ members, editorMemberId }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [categories, setCategories] = useState<ChoreCategory[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft([], []));
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const canEdit = editorMemberId != null;

  const loadAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.getTemplates(), api.getChoreCategories()])
      .then(([tpl, cats]) => {
        setTemplates(tpl);
        setCategories(cats);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!modalOpen || editingId != null) return;
    setDraft((d) => {
      if (d.categoryId != null) return d;
      const first = categories[0]?.id ?? null;
      if (first == null) return d;
      return { ...d, categoryId: first };
    });
  }, [modalOpen, editingId, categories]);

  const filteredTemplates = useMemo(() => {
    if (categoryFilterId === 'all') return templates;
    return templates.filter((t) => t.categoryId === categoryFilterId);
  }, [templates, categoryFilterId]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(categories, members));
    setNewCategoryName('');
    setModalOpen(true);
  };

  const openEdit = (t: ChoreTemplate) => {
    setEditingId(t.id);
    setDraft(templateToDraft(t));
    setNewCategoryName('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!canEdit || editorMemberId == null || !name) return;
    setError(null);
    try {
      const created = await api.createChoreCategory({ name }, editorMemberId);
      setCategories((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setDraft((d) => ({ ...d, categoryId: created.id }));
      setNewCategoryName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add category');
    }
  };

  const draftToPayload = (): ChoreTemplateSavePayload | null => {
    if (!draft.name.trim()) return null;
    if (draft.categoryId == null) return null;
    if (!draft.anyoneMayComplete && draft.assigneeIds.length === 0) return null;
    const semiannual =
      draft.frequencyType === 'SEMIANNUAL' && draft.semiannualMonths.trim()
        ? draft.semiannualMonths.trim()
        : draft.frequencyType === 'SEMIANNUAL'
          ? '[1,7]'
          : null;
    return {
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      assigneeIds: draft.assigneeIds,
      anyoneMayComplete: draft.anyoneMayComplete,
      frequencyType: draft.frequencyType,
      dayOfWeek: parseOptionalInt(draft.dayOfWeek),
      weekOfMonth: parseOptionalInt(draft.weekOfMonth),
      dayOfMonth: parseOptionalInt(draft.dayOfMonth),
      semiannualMonths: semiannual,
      conditionalDayOfWeek: parseOptionalInt(draft.conditionalDayOfWeek),
      conditionalAfterTime: draft.conditionalAfterTime.trim() || null,
      timeBlock: draft.timeBlock,
      pointsBase: Math.max(1, parseInt(draft.pointsBase, 10) || 1),
      active: draft.active,
    };
  };

  const handleSave = async () => {
    if (!canEdit || editorMemberId == null) return;
    const payload = draftToPayload();
    if (!payload) {
      setError('Name and category are required. For fixed assignees, pick at least one person.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId == null) {
        await api.createTemplate(payload, editorMemberId);
      } else {
        await api.updateTemplate(editingId, payload, editorMemberId);
      }
      closeModal();
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canEdit || editorMemberId == null) return;
    if (!window.confirm('Delete this task template?')) return;
    setError(null);
    try {
      await api.deleteTemplate(id, editorMemberId);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) return <p className="text-gray-600">Loading…</p>;

  const assignableMembers = members.filter((m) => !m.canEditChores);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      )}

      {!canEdit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Only the household member with edit permission can change templates, and your login name must match that
          person in the chore list.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <label htmlFor="tpl-cat-filter" className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Filter by category
          </label>
          <select
            id="tpl-cat-filter"
            value={categoryFilterId === 'all' ? 'all' : String(categoryFilterId)}
            onChange={(e) => {
              const v = e.target.value;
              setCategoryFilterId(v === 'all' ? 'all' : parseInt(v, 10));
            }}
            className="max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            New task template
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600">
        Showing {filteredTemplates.length} of {templates.length} template{templates.length !== 1 ? 's' : ''}.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Task</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Who</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">Schedule</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900">When</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-900">Pts</th>
              {canEdit && <th className="px-3 py-2 text-left font-semibold text-gray-900">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredTemplates.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2 font-medium text-gray-900">{t.name}</td>
                <td className="px-3 py-2 text-gray-700">{t.category.name}</td>
                <td className="px-3 py-2 text-gray-700">
                  {t.anyoneMayComplete ? (
                    <span>
                      <span className="font-medium text-gray-900">Anyone</span>
                      {t.assignees.length > 0 ? (
                        <span className="text-gray-600">
                          {' '}
                          · optional hints: {t.assignees.map((a) => a.member.name).join(', ')}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    t.assignees.map((a) => a.member.name).join(', ') || '—'
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{FREQUENCY_LABELS[t.frequencyType] ?? t.frequencyType}</td>
                <td className="px-3 py-2 text-gray-600">
                  {t.timeBlock}
                  {t.dayOfWeek != null && t.frequencyType === 'WEEKLY' && (
                    <span className="text-gray-500"> · {WEEKDAY_OPTIONS.find((d) => d.v === t.dayOfWeek)?.label}</span>
                  )}
                  {t.weekOfMonth != null && <span className="text-gray-500"> · week {t.weekOfMonth}</span>}
                  {t.conditionalAfterTime && (
                    <span className="text-gray-500"> · after {t.conditionalAfterTime}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-gray-800">{t.pointsBase}</td>
                {canEdit && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="mr-3 text-sm font-medium text-blue-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tpl-modal-title"
          >
            <h3 id="tpl-modal-title" className="text-lg font-semibold text-gray-900">
              {editingId == null ? 'New task template' : 'Edit task template'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Pick a category and schedule. For a normal chore, choose one or more assignees (each gets their own task
              row). For an &quot;anyone&quot; household chore, turn on the option below: one shared row per day; a
              parent picks whose allowance is at risk if it stays undone.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-800">Task name</label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Empty dishwasher"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                <label className="text-sm font-medium text-gray-800">Category</label>
                <select
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                  value={draft.categoryId ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      categoryId: e.target.value ? parseInt(e.target.value, 10) : null,
                    }))
                  }
                >
                  <option value="">Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="text"
                    className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void addCategory()}
                    disabled={!newCategoryName.trim()}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Add category
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-amber-50/40 p-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.anyoneMayComplete}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setDraft((d) => {
                      if (on) return { ...d, anyoneMayComplete: true, assigneeIds: [] };
                      const firstMembers = members.filter((m) => !m.canEditChores).map((m) => m.id);
                      const fallback =
                        firstMembers.length > 0 ? [firstMembers[0]] : members[0]?.id != null ? [members[0].id] : [];
                      return {
                        ...d,
                        anyoneMayComplete: false,
                        assigneeIds: d.assigneeIds.length > 0 ? d.assigneeIds : fallback,
                      };
                    });
                  }}
                />
                <span>
                  <span className="font-medium">Anyone in the household may complete this</span>
                  <span className="mt-1 block text-xs text-gray-600">
                    One task per day (not per child). If it is not done, a parent chooses which child&apos;s allowance is
                    reduced.
                  </span>
                </span>
              </label>

              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-800">
                  {draft.anyoneMayComplete ? 'Optional assignee hints' : 'Assigned to (one or more)'}
                </legend>
                <p className="mb-3 text-xs text-gray-500">
                  {draft.anyoneMayComplete
                    ? 'Checking names does not create separate tasks; it is only for reference. Leave all unchecked for a fully open household task.'
                    : 'Everyone checked gets the same task on the schedule.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {(assignableMembers.length > 0 ? assignableMembers : members).map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={draft.assigneeIds.includes(m.id)}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            assigneeIds: toggleAssignee(d.assigneeIds, m.id, d.anyoneMayComplete),
                          }))
                        }
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="text-sm font-medium text-gray-800">How often</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm"
                  value={draft.frequencyType}
                  onChange={(e) => setDraft((d) => ({ ...d, frequencyType: e.target.value }))}
                >
                  {FREQUENCY_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f] ?? f}
                    </option>
                  ))}
                </select>
              </div>

              {draft.frequencyType === 'WEEKLY' && (
                <div>
                  <label className="text-sm font-medium text-gray-800">Day of week</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={draft.dayOfWeek}
                    onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: e.target.value }))}
                  >
                    <option value="">Select day…</option>
                    {WEEKDAY_OPTIONS.map((d) => (
                      <option key={d.v} value={d.v}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.frequencyType === 'MONTHLY' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-800">Week of month (1–4)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. 1 for first week"
                      value={draft.weekOfMonth}
                      onChange={(e) => setDraft((d) => ({ ...d, weekOfMonth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-800">Or day of month (1–31)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Optional; leave blank if using week"
                      value={draft.dayOfMonth}
                      onChange={(e) => setDraft((d) => ({ ...d, dayOfMonth: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {draft.frequencyType === 'SEMIANNUAL' && (
                <div>
                  <label className="text-sm font-medium text-gray-800">Months (JSON array, 1=Jan)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                    value={draft.semiannualMonths}
                    onChange={(e) => setDraft((d) => ({ ...d, semiannualMonths: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-gray-500">Example: [1,7] for January and July.</p>
                </div>
              )}

              {draft.frequencyType === 'CONDITIONAL_SCHEDULE' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-800">Weekday</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={draft.conditionalDayOfWeek}
                      onChange={(e) => setDraft((d) => ({ ...d, conditionalDayOfWeek: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {WEEKDAY_OPTIONS.map((d) => (
                        <option key={d.v} value={d.v}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-800">Available after (24h)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="18:00"
                      value={draft.conditionalAfterTime}
                      onChange={(e) => setDraft((d) => ({ ...d, conditionalAfterTime: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-800">Time of day</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={draft.timeBlock}
                  onChange={(e) => setDraft((d) => ({ ...d, timeBlock: e.target.value }))}
                >
                  {TIME_BLOCKS.map((tb) => (
                    <option key={tb} value={tb}>
                      {tb === 'ANY' ? 'Any time' : tb.charAt(0) + tb.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-800">Base points</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={draft.pointsBase}
                  onChange={(e) => setDraft((d) => ({ ...d, pointsBase: e.target.value }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Active (inactive templates do not generate tasks)
              </label>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
